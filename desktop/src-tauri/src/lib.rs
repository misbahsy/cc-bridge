use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};

// Bridge status from the Control API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeStatus {
    running: bool,
    uptime: u64,
    channels: Vec<ChannelStatus>,
    sessions: SessionStats,
    pairings: PairingStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelStatus {
    name: String,
    enabled: bool,
    connected: bool,
    #[serde(rename = "botCount")]
    bot_count: u32,
    bots: Vec<BotInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotInfo {
    id: String,
    username: Option<String>,
    #[serde(rename = "agentId")]
    agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStats {
    active: u32,
    total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingStats {
    pending: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingRequest {
    code: String,
    #[serde(rename = "chatKey")]
    chat_key: String,
    #[serde(rename = "userInfo")]
    user_info: UserInfo,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    id: String,
    username: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    channel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingsResponse {
    pairings: Vec<PairingRequest>,
}

// Service state
struct ServiceState {
    process: Option<Child>,
    is_running: bool,
    logs: Vec<String>,
}

impl Default for ServiceState {
    fn default() -> Self {
        Self {
            process: None,
            is_running: false,
            logs: Vec::new(),
        }
    }
}

type AppState = Arc<Mutex<ServiceState>>;

const API_URL: &str = "http://127.0.0.1:38792";

// Commands

fn get_extended_path() -> String {
    // macOS GUI apps don't inherit shell PATH, so we need to build it ourselves
    let home = dirs::home_dir().map(|h| h.to_string_lossy().to_string()).unwrap_or_default();
    let current_path = std::env::var("PATH").unwrap_or_default();

    let mut extra_paths = vec![
        format!("{home}/.volta/bin"),
        format!("{home}/.npm/bin"),
        format!("{home}/.local/bin"),
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        "/usr/bin".to_string(),
    ];

    // Dynamically find all nvm node versions (sorted by version desc so newest is first)
    let nvm_dir = format!("{home}/.nvm/versions/node");
    if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
        let mut versions: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .map(|e| format!("{}/bin", e.path().display()))
            .collect();
        versions.sort_by(|a, b| b.cmp(a)); // Newest versions first
        extra_paths.splice(0..0, versions);
    }

    format!("{}:{}", extra_paths.join(":"), current_path)
}

fn try_start_ccb() -> Option<Child> {
    let extended_path = get_extended_path();

    // Try 1: ccb command with extended PATH
    if let Ok(child) = Command::new("ccb")
        .arg("start")
        .env("PATH", &extended_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        return Some(child);
    }

    // Try 2: npx ccb with extended PATH
    if let Ok(child) = Command::new("npx")
        .args(["cc-bridge", "start"])
        .env("PATH", &extended_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        return Some(child);
    }

    // Try 3: Check common global npm paths directly
    let home = dirs::home_dir()?;
    let npm_paths = [
        home.join(".nvm/versions/node").join("*").join("bin/ccb"),
        home.join(".volta/bin/ccb"),
        home.join(".npm/bin/ccb"),
        PathBuf::from("/usr/local/bin/ccb"),
        PathBuf::from("/opt/homebrew/bin/ccb"),
    ];

    for pattern in &npm_paths {
        if let Ok(entries) = glob::glob(pattern.to_string_lossy().as_ref()) {
            for entry in entries.filter_map(Result::ok) {
                if let Ok(child) = Command::new(&entry)
                    .arg("start")
                    .env("PATH", &extended_path)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                {
                    return Some(child);
                }
            }
        }
    }

    None
}

#[tauri::command]
async fn start_service(state: State<'_, AppState>) -> Result<bool, String> {
    // Clear old logs
    {
        let mut service = state.lock().map_err(|e| e.to_string())?;
        service.logs.clear();
        service.logs.push("Starting CCB bridge...".to_string());

        // Check if process is actually running (not just the flag)
        if service.is_running {
            if let Some(ref mut child) = service.process {
                // Check if process is still alive
                match child.try_wait() {
                    Ok(Some(_)) => {
                        // Process has exited, reset state
                        service.is_running = false;
                        service.process = None;
                        service.logs.push("Previous process had stopped, starting fresh...".to_string());
                    }
                    Ok(None) => {
                        // Process is still running
                        service.logs.push("Bridge is already running".to_string());
                        return Ok(true);
                    }
                    Err(_) => {
                        // Error checking, reset state
                        service.is_running = false;
                        service.process = None;
                    }
                }
            } else {
                // Flag is set but no process handle, reset state
                service.is_running = false;
                service.logs.push("Resetting stale state...".to_string());
            }
        }
    }

    // Try multiple ways to start the bridge
    let child = try_start_ccb();

    match child {
        Some(mut child) => {
            // Capture stderr for logs
            if let Some(stderr) = child.stderr.take() {
                let state_clone = Arc::clone(state.inner());
                thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        if let Ok(line) = line {
                            if let Ok(mut service) = state_clone.lock() {
                                service.logs.push(line);
                                // Keep last 50 lines
                                if service.logs.len() > 50 {
                                    service.logs.remove(0);
                                }
                            }
                        }
                    }
                });
            }

            // Capture stdout too
            if let Some(stdout) = child.stdout.take() {
                let state_clone = Arc::clone(state.inner());
                thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines() {
                        if let Ok(line) = line {
                            if let Ok(mut service) = state_clone.lock() {
                                service.logs.push(line);
                                if service.logs.len() > 50 {
                                    service.logs.remove(0);
                                }
                            }
                        }
                    }
                });
            }

            {
                let mut service = state.lock().map_err(|e| e.to_string())?;
                service.process = Some(child);
                service.is_running = true;
            }

            // Wait a bit for the service to start
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

            Ok(true)
        }
        None => {
            let mut service = state.lock().map_err(|e| e.to_string())?;
            let error_msg = "Failed to start: ccb command not found. Please install ccb globally with: npm install -g claude-code-bridge".to_string();
            service.logs.push(error_msg.clone());
            Err(error_msg)
        }
    }
}

#[tauri::command]
async fn stop_service(state: State<'_, AppState>) -> Result<bool, String> {
    // Try to stop gracefully via API first (works even if started outside this app)
    let client = reqwest::Client::new();
    let _api_result = client
        .post(format!("{}/stop", API_URL))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await;

    // Kill our tracked process if we have one
    {
        let mut service = state.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut child) = service.process {
            let _ = child.kill();
            let _ = child.wait(); // Wait for process to actually exit
        }
        service.process = None;
        service.is_running = false;
        service.logs.push("Bridge stopped.".to_string());
    }

    // Also try to kill any ccb process by name (fallback for processes started outside this app)
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("pkill")
            .args(["-f", "ccb start"])
            .output();
    }

    // Wait a moment then verify it's stopped
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // Check if API is still responding
    let still_running = client
        .get(format!("{}/status", API_URL))
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .is_ok();

    if still_running {
        let mut service = state.lock().map_err(|e| e.to_string())?;
        service.logs.push("Warning: Bridge may still be running".to_string());
    }

    Ok(!still_running)
}

#[tauri::command]
async fn get_status() -> Result<Option<BridgeStatus>, String> {
    let client = reqwest::Client::new();

    match client.get(format!("{}/status", API_URL)).send().await {
        Ok(response) => {
            if response.status().is_success() {
                let status: BridgeStatus = response.json().await.map_err(|e| e.to_string())?;
                Ok(Some(status))
            } else {
                Ok(None)
            }
        }
        Err(_) => Ok(None),
    }
}

#[tauri::command]
async fn get_pairings() -> Result<Vec<PairingRequest>, String> {
    let client = reqwest::Client::new();

    match client.get(format!("{}/pairings", API_URL)).send().await {
        Ok(response) => {
            if response.status().is_success() {
                let data: PairingsResponse = response.json().await.map_err(|e| e.to_string())?;
                Ok(data.pairings)
            } else {
                Ok(vec![])
            }
        }
        Err(_) => Ok(vec![]),
    }
}

#[tauri::command]
async fn approve_pairing(code: String) -> Result<bool, String> {
    let client = reqwest::Client::new();

    match client
        .post(format!("{}/pairings/{}/approve", API_URL, code))
        .send()
        .await
    {
        Ok(response) => Ok(response.status().is_success()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn deny_pairing(code: String) -> Result<bool, String> {
    let client = reqwest::Client::new();

    match client
        .post(format!("{}/pairings/{}/deny", API_URL, code))
        .send()
        .await
    {
        Ok(response) => Ok(response.status().is_success()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn is_service_running(state: State<'_, AppState>) -> bool {
    state.lock().map(|s| s.is_running).unwrap_or(false)
}

#[tauri::command]
fn get_logs(state: State<'_, AppState>) -> Vec<String> {
    state.lock().map(|s| s.logs.clone()).unwrap_or_default()
}

#[tauri::command]
fn clear_logs(state: State<'_, AppState>) {
    if let Ok(mut s) = state.lock() {
        s.logs.clear();
    }
}

fn get_config_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".ccb").join("config.json")
}

fn get_plugins_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".claude").join("plugins").join("installed_plugins.json")
}

#[tauri::command]
fn get_installed_plugins() -> Result<Vec<InstalledPlugin>, String> {
    let plugins_path = get_plugins_path();

    if !plugins_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&plugins_path)
        .map_err(|e| format!("Failed to read plugins file: {}", e))?;

    let plugins_file: InstalledPluginsFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse plugins file: {}", e))?;

    let mut installed_plugins: Vec<InstalledPlugin> = Vec::new();

    for (name, entries) in plugins_file.plugins {
        // Take the first entry (most recent) for each plugin
        if let Some(entry) = entries.first() {
            installed_plugins.push(InstalledPlugin {
                name: name.clone(),
                path: entry.install_path.clone(),
                version: entry.version.clone(),
            });
        }
    }

    // Sort by name for consistent ordering
    installed_plugins.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(installed_plugins)
}

#[tauri::command]
fn check_config() -> bool {
    get_config_path().exists()
}

// Response structure for reading config
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConfigResponse {
    telegram_bots: Vec<BotConfig>,
    discord_bots: Vec<BotConfig>,
}

#[tauri::command]
fn read_config() -> Result<ConfigResponse, String> {
    let config_path = get_config_path();

    if !config_path.exists() {
        return Ok(ConfigResponse::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let mut response = ConfigResponse::default();

    // Extract Telegram bots
    if let Some(telegram) = config.get("channels").and_then(|c| c.get("telegram")) {
        if let Some(bots) = telegram.get("bots").and_then(|b| b.as_array()) {
            for bot in bots {
                let id = bot.get("id").and_then(|v| v.as_str()).unwrap_or("main").to_string();
                let token = bot.get("botToken").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let agent_id = bot.get("agentId").and_then(|v| v.as_str()).map(|s| s.to_string());
                response.telegram_bots.push(BotConfig { id, token, agent_id });
            }
        }
    }

    // Extract Discord bots (Discord uses "token" not "botToken")
    if let Some(discord) = config.get("channels").and_then(|c| c.get("discord")) {
        if let Some(bots) = discord.get("bots").and_then(|b| b.as_array()) {
            for bot in bots {
                let id = bot.get("id").and_then(|v| v.as_str()).unwrap_or("main").to_string();
                let token = bot.get("token").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let agent_id = bot.get("agentId").and_then(|v| v.as_str()).map(|s| s.to_string());
                response.discord_bots.push(BotConfig { id, token, agent_id });
            }
        }
    }

    Ok(response)
}

// Bot configuration for multi-bot support
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotConfig {
    id: String,
    token: String,
    #[serde(rename = "agentId")]
    agent_id: Option<String>,
}

// Agent configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    id: String,
    name: String,
    workspace: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_turns: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    permission_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disallowed_tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    allowed_tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    skills: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    plugins: Option<Vec<PluginConfig>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mcp_servers: Option<Vec<McpServerConfig>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginConfig {
    #[serde(rename = "type")]
    plugin_type: String,
    path: String,
}

// Installed plugin from ~/.claude/plugins/installed_plugins.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledPlugin {
    name: String,
    path: String,
    version: String,
}

#[derive(Debug, Clone, Deserialize)]
struct InstalledPluginEntry {
    #[serde(rename = "installPath")]
    install_path: String,
    version: String,
}

#[derive(Debug, Clone, Deserialize)]
struct InstalledPluginsFile {
    plugins: std::collections::HashMap<String, Vec<InstalledPluginEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    env: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "type")]
    server_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
}

// Agent management commands
#[tauri::command]
fn get_agents() -> Result<Vec<AgentConfig>, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let agents = config
        .get("agents")
        .and_then(|a| a.get("list"))
        .and_then(|l| l.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    Ok(agents)
}

#[tauri::command]
fn add_agent(agent: AgentConfig) -> Result<bool, String> {
    let config_path = get_config_path();

    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse config: {}", e))?
    } else {
        serde_json::json!({
            "agents": { "list": [] },
            "channels": {}
        })
    };

    // Get or create agents list
    let agents_list = config
        .get_mut("agents")
        .and_then(|a| a.get_mut("list"))
        .and_then(|l| l.as_array_mut())
        .ok_or("Invalid config structure")?;

    // Check if agent already exists
    if agents_list.iter().any(|a| a.get("id").and_then(|v| v.as_str()) == Some(&agent.id)) {
        return Err(format!("Agent '{}' already exists", agent.id));
    }

    // Add new agent
    let agent_value = serde_json::to_value(&agent).map_err(|e| e.to_string())?;
    agents_list.push(agent_value);

    // Write config
    let config_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, config_str).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(true)
}

#[tauri::command]
fn update_agent(agent: AgentConfig) -> Result<bool, String> {
    let config_path = get_config_path();

    if !config_path.exists() {
        return Err("Config file not found".to_string());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    let mut config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let agents_list = config
        .get_mut("agents")
        .and_then(|a| a.get_mut("list"))
        .and_then(|l| l.as_array_mut())
        .ok_or("Invalid config structure")?;

    // Find and update agent
    let mut found = false;
    for a in agents_list.iter_mut() {
        if a.get("id").and_then(|v| v.as_str()) == Some(&agent.id) {
            *a = serde_json::to_value(&agent).map_err(|e| e.to_string())?;
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!("Agent '{}' not found", agent.id));
    }

    // Write config
    let config_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, config_str).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(true)
}

#[tauri::command]
fn remove_agent(id: String) -> Result<bool, String> {
    let config_path = get_config_path();

    if !config_path.exists() {
        return Err("Config file not found".to_string());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    let mut config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let agents_list = config
        .get_mut("agents")
        .and_then(|a| a.get_mut("list"))
        .and_then(|l| l.as_array_mut())
        .ok_or("Invalid config structure")?;

    // Don't allow removing last agent
    if agents_list.len() <= 1 {
        return Err("Cannot remove the last agent".to_string());
    }

    // Remove agent
    let original_len = agents_list.len();
    agents_list.retain(|a| a.get("id").and_then(|v| v.as_str()) != Some(&id));

    if agents_list.len() == original_len {
        return Err(format!("Agent '{}' not found", id));
    }

    // Write config
    let config_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, config_str).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(true)
}

#[tauri::command]
fn save_config(
    telegram_bots: Option<Vec<BotConfig>>,
    discord_bots: Option<Vec<BotConfig>>,
    // Legacy single-token support for backward compatibility
    telegram_token: Option<String>,
    discord_token: Option<String>,
) -> Result<bool, String> {
    let config_path = get_config_path();
    let config_dir = config_path.parent().unwrap();

    // Create directory if it doesn't exist
    fs::create_dir_all(config_dir).map_err(|e| format!("Failed to create config dir: {}", e))?;

    // Load existing config or create default
    let mut config: serde_json::Value = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse config: {}", e))?
    } else {
        let home_dir = dirs::home_dir().unwrap().to_string_lossy().to_string();
        serde_json::json!({
            "agents": {
                "default": "claude",
                "list": [{
                    "id": "claude",
                    "name": "Claude",
                    "workspace": home_dir
                }]
            },
            "channels": {}
        })
    };

    // Ensure channels object exists
    if config.get("channels").is_none() {
        config["channels"] = serde_json::json!({});
    }

    // Handle Telegram bots - only update if provided
    if telegram_bots.is_some() || telegram_token.is_some() {
        let tg_bots: Vec<serde_json::Value> = if let Some(bots) = telegram_bots {
            bots.iter()
                .filter(|b| !b.token.is_empty())
                .map(|b| {
                    let mut bot = serde_json::json!({
                        "id": b.id,
                        "botToken": b.token,
                        "dmPolicy": "pairing"
                    });
                    if let Some(ref agent_id) = b.agent_id {
                        if !agent_id.is_empty() {
                            bot["agentId"] = serde_json::json!(agent_id);
                        }
                    }
                    bot
                })
                .collect()
        } else if let Some(ref token) = telegram_token {
            if !token.is_empty() {
                vec![serde_json::json!({
                    "id": "main",
                    "botToken": token,
                    "dmPolicy": "pairing"
                })]
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        if !tg_bots.is_empty() {
            config["channels"]["telegram"] = serde_json::json!({
                "enabled": true,
                "bots": tg_bots
            });
        } else {
            // Remove telegram if no bots
            if let Some(channels) = config["channels"].as_object_mut() {
                channels.remove("telegram");
            }
        }
    }

    // Handle Discord bots - only update if provided
    if discord_bots.is_some() || discord_token.is_some() {
        let dc_bots: Vec<serde_json::Value> = if let Some(bots) = discord_bots {
            bots.iter()
                .filter(|b| !b.token.is_empty())
                .map(|b| {
                    let mut bot = serde_json::json!({
                        "id": b.id,
                        "token": b.token,
                        "dmPolicy": "pairing"
                    });
                    if let Some(ref agent_id) = b.agent_id {
                        if !agent_id.is_empty() {
                            bot["agentId"] = serde_json::json!(agent_id);
                        }
                    }
                    bot
                })
                .collect()
        } else if let Some(ref token) = discord_token {
            if !token.is_empty() {
                vec![serde_json::json!({
                    "id": "main",
                    "token": token,
                    "dmPolicy": "pairing"
                })]
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        if !dc_bots.is_empty() {
            config["channels"]["discord"] = serde_json::json!({
                "enabled": true,
                "bots": dc_bots
            });
        } else {
            // Remove discord if no bots
            if let Some(channels) = config["channels"].as_object_mut() {
                channels.remove("discord");
            }
        }
    }

    // Ensure agents exist with at least a default
    if config.get("agents").is_none() || config["agents"].get("list").map(|l| l.as_array().map(|a| a.is_empty()).unwrap_or(true)).unwrap_or(true) {
        let home_dir = dirs::home_dir().unwrap().to_string_lossy().to_string();
        config["agents"] = serde_json::json!({
            "default": "claude",
            "list": [{
                "id": "claude",
                "name": "Claude",
                "workspace": home_dir
            }]
        });
    }

    // Write config file
    let config_str = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&config_path, config_str).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(Mutex::new(ServiceState::default())))
        .setup(|app| {
            // Create tray menu
            let quit = MenuItem::with_id(app, "quit", "Quit CCB", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            // Create tray icon using the default window icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            // Toggle window visibility
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                // Position window below tray icon
                                let window_size = window.outer_size().unwrap_or(tauri::PhysicalSize { width: 320, height: 480 });

                                // Extract tray rect position and size
                                let (tray_x, tray_y) = match rect.position {
                                    tauri::Position::Physical(pos) => (pos.x as i32, pos.y as i32),
                                    tauri::Position::Logical(pos) => (pos.x as i32, pos.y as i32),
                                };
                                let (tray_w, tray_h) = match rect.size {
                                    tauri::Size::Physical(size) => (size.width as i32, size.height as i32),
                                    tauri::Size::Logical(size) => (size.width as i32, size.height as i32),
                                };

                                // Calculate position: center horizontally under tray, with small gap below
                                let x = tray_x + (tray_w / 2) - (window_size.width as i32 / 2);
                                let y = tray_y + tray_h + 4; // 4px gap below tray

                                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Hide window when it loses focus (menu bar app behavior)
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = window_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_service,
            stop_service,
            get_status,
            get_pairings,
            approve_pairing,
            deny_pairing,
            is_service_running,
            check_config,
            read_config,
            save_config,
            get_logs,
            clear_logs,
            get_agents,
            add_agent,
            update_agent,
            remove_agent,
            get_installed_plugins,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
