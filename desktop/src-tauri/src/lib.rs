use serde::{Deserialize, Serialize};
use std::process::{Child, Command};
use std::sync::Mutex;
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
}

impl Default for ServiceState {
    fn default() -> Self {
        Self {
            process: None,
            is_running: false,
        }
    }
}

type AppState = Mutex<ServiceState>;

const API_URL: &str = "http://127.0.0.1:38792";

// Commands

#[tauri::command]
async fn start_service(state: State<'_, AppState>) -> Result<bool, String> {
    let mut service = state.lock().map_err(|e| e.to_string())?;

    if service.is_running {
        return Ok(true);
    }

    // Start the ccb process
    let child = Command::new("ccb")
        .arg("start")
        .spawn()
        .map_err(|e| format!("Failed to start ccb: {}", e))?;

    service.process = Some(child);
    service.is_running = true;

    // Wait a bit for the service to start
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    Ok(true)
}

#[tauri::command]
async fn stop_service(state: State<'_, AppState>) -> Result<bool, String> {
    let mut service = state.lock().map_err(|e| e.to_string())?;

    if !service.is_running {
        return Ok(true);
    }

    // Try to stop gracefully via API first
    let client = reqwest::Client::new();
    let _ = client.post(format!("{}/stop", API_URL)).send().await;

    // Kill the process if it's still running
    if let Some(ref mut child) = service.process {
        let _ = child.kill();
    }

    service.process = None;
    service.is_running = false;

    Ok(true)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Mutex::new(ServiceState::default()))
        .setup(|app| {
            // Create tray menu
            let quit = MenuItem::with_id(app, "quit", "Quit CCB", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            // Create tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .menu_on_left_click(false)
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
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            // Toggle window visibility
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                // Position window near tray icon
                                if let Ok(position) = tray.rect() {
                                    let _ = window.set_position(tauri::Position::Physical(
                                        tauri::PhysicalPosition {
                                            x: (position.position.x - 160.0) as i32,
                                            y: (position.position.y + position.size.height) as i32,
                                        },
                                    ));
                                }
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
