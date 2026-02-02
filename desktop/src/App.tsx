import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface BotInfo {
  id: string;
  username?: string;
  agentId?: string;
}

interface ChannelStatus {
  name: string;
  enabled: boolean;
  connected: boolean;
  botCount: number;
  bots: BotInfo[];
}

interface BridgeStatus {
  running: boolean;
  uptime: number;
  channels: ChannelStatus[];
  sessions: { active: number; total: number };
  pairings: { pending: number };
}

interface PairingRequest {
  code: string;
  chatKey: string;
  userInfo: {
    id: string;
    username?: string;
    displayName?: string;
    channel: string;
  };
  createdAt: string;
  expiresAt: string;
}

type OnboardingStep = "welcome" | "bots" | "agents" | "complete";
type SettingsTab = "bots" | "agents";

interface BotConfig {
  id: string;
  token: string;
  agentId?: string;
}

interface PluginConfig {
  type: string;
  path: string;
}

interface AgentConfig {
  id: string;
  name: string;
  workspace: string;
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
  permissionMode?: string;
  tools?: string[];
  disallowedTools?: string[];
  allowedTools?: string[];
  skills?: string[];
  plugins?: PluginConfig[];
}

interface ConfigResponse {
  telegramBots: BotConfig[];
  discordBots: BotConfig[];
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

const channelIcons: Record<string, string> = {
  telegram: "TG",
  discord: "DC",
};

// Available tools in Claude Code (must match exact SDK tool names)
const AVAILABLE_TOOLS = [
  { id: "Bash", label: "Bash", description: "Execute shell commands" },
  { id: "Read", label: "Read", description: "Read files" },
  { id: "Write", label: "Write", description: "Write files" },
  { id: "Edit", label: "Edit", description: "Edit files" },
  { id: "MultiEdit", label: "MultiEdit", description: "Edit multiple files" },
  { id: "Glob", label: "Glob", description: "Find files by pattern" },
  { id: "Grep", label: "Grep", description: "Search file contents" },
  { id: "LS", label: "LS", description: "List directory contents" },
  { id: "WebFetch", label: "WebFetch", description: "Fetch web pages" },
  { id: "WebSearch", label: "WebSearch", description: "Search the web" },
  { id: "Task", label: "Task", description: "Create sub-agents" },
  { id: "NotebookEdit", label: "NotebookEdit", description: "Edit notebooks" },
];

// Common built-in skills (slash commands)
const AVAILABLE_SKILLS = [
  { id: "commit", label: "/commit", description: "Create git commits" },
  { id: "review", label: "/review", description: "Review code changes" },
  { id: "test", label: "/test", description: "Generate tests" },
  { id: "fix", label: "/fix", description: "Fix bugs or issues" },
  { id: "explain", label: "/explain", description: "Explain how code works" },
  { id: "research", label: "/research", description: "Deep research on topics" },
];

function App() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [pairings, setPairings] = useState<PairingRequest[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("bots");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("welcome");
  const [telegramBots, setTelegramBots] = useState<BotConfig[]>([{ id: "main", token: "" }]);
  const [discordBots, setDiscordBots] = useState<BotConfig[]>([{ id: "main", token: "" }]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await invoke<BridgeStatus | null>("get_status");
      setStatus(result);
      if (result) {
        setNeedsSetup(false);
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
      setStatus(null);
    }
  }, []);

  const fetchPairings = useCallback(async () => {
    try {
      const result = await invoke<PairingRequest[]>("get_pairings");
      setPairings(result);
    } catch (error) {
      console.error("Failed to fetch pairings:", error);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const result = await invoke<AgentConfig[]>("get_agents");
      setAgents(result);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    }
  }, []);

  const loadExistingConfig = useCallback(async () => {
    try {
      const config = await invoke<ConfigResponse>("read_config");

      // Update state with loaded bots, or reset to defaults if empty
      setTelegramBots(config.telegramBots?.length > 0 ? config.telegramBots : [{ id: "main", token: "" }]);
      setDiscordBots(config.discordBots?.length > 0 ? config.discordBots : [{ id: "main", token: "" }]);

      await fetchAgents();
    } catch (error) {
      console.error("Failed to load config:", error);
    }
  }, [fetchAgents]);

  const checkConfig = useCallback(async () => {
    try {
      const hasConfig = await invoke<boolean>("check_config");
      setNeedsSetup(!hasConfig);
      if (!hasConfig) {
        setShowSetup(true);
      } else {
        await loadExistingConfig();
      }
    } catch {
      setNeedsSetup(true);
    }
  }, [loadExistingConfig]);

  const fetchLogs = useCallback(async () => {
    try {
      const result = await invoke<string[]>("get_logs");
      setLogs(result);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    }
  }, []);

  useEffect(() => {
    checkConfig();
    fetchStatus();
    fetchPairings();
    fetchLogs();
    const interval = setInterval(() => {
      fetchStatus();
      fetchPairings();
      fetchLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchPairings, fetchLogs, checkConfig]);

  const handleStart = async () => {
    if (needsSetup) {
      setShowSetup(true);
      return;
    }
    setIsStarting(true);
    setShowLogs(true);
    setLogs(["Starting CCB bridge..."]);
    try {
      await invoke("start_service");
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        await fetchLogs();
        await fetchStatus();
      }
    } catch (error) {
      console.error("Failed to start:", error);
      setLogs(prev => [...prev, `Error: ${error}`]);
    } finally {
      setIsStarting(false);
    }
  };

  const [isStopping, setIsStopping] = useState(false);

  const handleStop = async () => {
    setIsStopping(true);
    setLogs(prev => [...prev, "Stopping bridge..."]);
    setShowLogs(true);
    try {
      await invoke("stop_service");
      setStatus(null);
      setLogs(prev => [...prev, "Bridge stopped."]);
    } catch (error) {
      console.error("Failed to stop:", error);
      setLogs(prev => [...prev, `Error stopping: ${error}`]);
    } finally {
      setIsStopping(false);
    }
  };

  const handleRestart = async () => {
    setLogs(["Restarting bridge..."]);
    setShowLogs(true);
    await handleStop();
    await new Promise(r => setTimeout(r, 1000));
    await handleStart();
  };

  const handleApprove = async (code: string) => {
    await invoke("approve_pairing", { code });
    fetchPairings();
  };

  const handleDeny = async (code: string) => {
    await invoke("deny_pairing", { code });
    fetchPairings();
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const validTgBots = telegramBots.filter(b => b.token.trim() !== "");
      const validDcBots = discordBots.filter(b => b.token.trim() !== "");

      await invoke("save_config", {
        telegramBots: validTgBots.length > 0 ? validTgBots : null,
        discordBots: validDcBots.length > 0 ? validDcBots : null,
      });

      // Close any open panels
      setNeedsSetup(false);
      setShowSetup(false);
      setShowSettings(false);
      setOnboardingStep("welcome");

      // If bridge is running, restart it; otherwise just start it
      if (status?.running) {
        setLogs(["Config saved. Restarting bridge..."]);
        setShowLogs(true);
        await handleStop();
        await new Promise(r => setTimeout(r, 1000));
        await handleStart();
      } else {
        handleStart();
      }
    } catch (error) {
      console.error("Failed to save config:", error);
      setLogs(prev => [...prev, `Error saving config: ${error}`]);
      setShowLogs(true);
    } finally {
      setIsSaving(false);
    }
  };

  const isRunning = status?.running ?? false;
  const connectedChannels = status?.channels.filter((c) => c.connected).length ?? 0;
  const totalBots = status?.channels.reduce((sum, c) => sum + c.botCount, 0) ?? 0;

  // Show onboarding wizard for first-time users
  if (showSetup && needsSetup) {
    return (
      <div className="min-h-screen bg-[#0d0d0f] text-[#e8e8ed] overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)]">
        <OnboardingWizard
          step={onboardingStep}
          setStep={setOnboardingStep}
          telegramBots={telegramBots}
          setTelegramBots={setTelegramBots}
          discordBots={discordBots}
          setDiscordBots={setDiscordBots}
          agents={agents}
          setAgents={setAgents}
          onSave={handleSaveConfig}
          isSaving={isSaving}
        />
      </div>
    );
  }

  // Show settings panel for existing users
  if (showSettings) {
    return (
      <div className="min-h-screen bg-[#0d0d0f] text-[#e8e8ed] overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)]">
        <SettingsPanel
          tab={settingsTab}
          setTab={setSettingsTab}
          telegramBots={telegramBots}
          setTelegramBots={setTelegramBots}
          discordBots={discordBots}
          setDiscordBots={setDiscordBots}
          agents={agents}
          setAgents={setAgents}
          onSave={handleSaveConfig}
          onClose={() => setShowSettings(false)}
          isSaving={isSaving}
          isRunning={isRunning}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#e8e8ed] overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)]">
      {/* Header */}
      <header className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                isRunning ? "bg-[#32d74b]" : "bg-[#636366]"
              }`}
            />
            {isRunning && (
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-[#32d74b] animate-ping opacity-40" />
            )}
          </div>
          <div>
            <div className="font-medium text-[13px] tracking-tight">CCB Bridge</div>
            <div className="text-[11px] text-[#636366] font-mono">
              {isRunning ? formatUptime(status!.uptime) : "offline"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isRunning && (
            <>
              <button
                onClick={handleRestart}
                disabled={isStarting || isStopping}
                title="Restart"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] hover:border-[#ff9f0a] hover:bg-[rgba(255,159,10,0.1)] transition-all"
              >
                <svg className="w-3.5 h-3.5 text-[#8e8e93]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 4v6h6M23 20v-6h-6" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                </svg>
              </button>
              <button
                onClick={handleStop}
                disabled={isStopping}
                title="Stop"
                className={`w-8 h-8 rounded-lg flex items-center justify-center bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] hover:border-[#ff453a] hover:bg-[rgba(255,69,58,0.1)] transition-all ${isStopping ? "opacity-50" : ""}`}
              >
                {isStopping ? (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-[#8e8e93]" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                )}
              </button>
            </>
          )}
          {!isRunning && (
            <button
              onClick={handleStart}
              disabled={isStarting}
              title="Start"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ease-out ${isStarting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} bg-[#32d74b] hover:bg-[#30d158] shadow-[0_0_20px_rgba(50,215,75,0.25)]`}
            >
              {isStarting ? (
                <svg className="w-4 h-4 animate-spin text-[#0d0d0f]" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-[#0d0d0f]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </header>

      {isRunning && (
        <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)] grid grid-cols-3 gap-4">
          <Stat label="Channels" value={connectedChannels} />
          <Stat label="Bots" value={totalBots} />
          <Stat label="Sessions" value={status!.sessions.active} />
        </div>
      )}

      <div className="p-4 space-y-3 max-h-[320px] overflow-y-auto">
        {pairings.length > 0 && (
          <section>
            <SectionHeader title="Pairing Requests" count={pairings.length} accent />
            <div className="space-y-2 mt-2">
              {pairings.map((pairing) => (
                <PairingCard
                  key={pairing.code}
                  pairing={pairing}
                  onApprove={() => handleApprove(pairing.code)}
                  onDeny={() => handleDeny(pairing.code)}
                />
              ))}
            </div>
          </section>
        )}

        {isRunning && status!.channels.length > 0 && (
          <section>
            <SectionHeader title="Channels" />
            <div className="space-y-2 mt-2">
              {status!.channels.map((channel) => (
                <ChannelCard key={channel.name} channel={channel} />
              ))}
            </div>
          </section>
        )}

        {!isRunning && needsSetup && pairings.length === 0 && (
          <div className="py-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#141417] border border-[rgba(255,255,255,0.06)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[#32d74b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 4v16m8-8H4" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-[13px] text-[#e8e8ed] mb-1">Welcome to CCB</p>
            <p className="text-[11px] text-[#636366] mb-4">Connect your messaging apps to get started</p>
            <button
              onClick={() => setShowSetup(true)}
              className="px-4 py-2 rounded-lg text-[12px] font-medium bg-[#32d74b] text-[#0d0d0f] hover:bg-[#30d158] transition-colors"
            >
              Set Up Connection
            </button>
          </div>
        )}

        {!isRunning && !needsSetup && pairings.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#141417] border border-[rgba(255,255,255,0.06)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[#636366]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4.75 12a7.25 7.25 0 0114.5 0m-14.5 0a7.25 7.25 0 007.25 7.25m-7.25-7.25H3m16.25 0H21m-9-9v1.75m0 14.5V21" />
                <circle cx="12" cy="12" r="2.25" />
              </svg>
            </div>
            <p className="text-[13px] text-[#8e8e93] mb-1">Bridge is offline</p>
            <p className="text-[11px] text-[#636366]">Press the green button to connect</p>
          </div>
        )}
      </div>

      {showLogs && logs.length > 0 && (
        <div className="border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0a0b]">
            <span className="text-[10px] font-semibold text-[#636366] uppercase tracking-wider">Logs</span>
            <button
              onClick={() => setShowLogs(false)}
              className="text-[10px] text-[#636366] hover:text-[#8e8e93]"
            >
              Hide
            </button>
          </div>
          <div className="h-[120px] overflow-y-auto bg-[#0a0a0b] px-3 py-2 font-mono text-[10px]">
            {logs.map((line, i) => (
              <div
                key={i}
                className={`py-0.5 ${
                  line.toLowerCase().includes("error") || line.toLowerCase().includes("failed")
                    ? "text-[#ff453a]"
                    : line.toLowerCase().includes("success") || line.toLowerCase().includes("connected")
                    ? "text-[#32d74b]"
                    : "text-[#8e8e93]"
                }`}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="px-4 py-2 border-t border-[rgba(255,255,255,0.06)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              await loadExistingConfig();
              setShowSettings(true);
            }}
            className="text-[11px] text-[#636366] hover:text-[#8e8e93] transition-colors"
          >
            Settings
          </button>
          {logs.length > 0 && !showLogs && (
            <button
              onClick={() => setShowLogs(true)}
              className="text-[11px] text-[#636366] hover:text-[#8e8e93] transition-colors"
            >
              Logs ({logs.length})
            </button>
          )}
        </div>
        <span className="text-[11px] text-[#636366] font-mono">v0.1.0</span>
      </footer>
    </div>
  );
}

// Onboarding Wizard Component (for first-time users only)
function OnboardingWizard({
  step,
  setStep,
  telegramBots,
  setTelegramBots,
  discordBots,
  setDiscordBots,
  agents,
  setAgents,
  onSave,
  isSaving,
}: {
  step: OnboardingStep;
  setStep: (s: OnboardingStep) => void;
  telegramBots: BotConfig[];
  setTelegramBots: (bots: BotConfig[]) => void;
  discordBots: BotConfig[];
  setDiscordBots: (bots: BotConfig[]) => void;
  agents: AgentConfig[];
  setAgents: (agents: AgentConfig[]) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const hasBots = telegramBots.some(b => b.token) || discordBots.some(b => b.token);

  // Progress indicator
  const steps = ["welcome", "bots", "agents", "complete"] as const;
  const currentIndex = steps.indexOf(step);

  // Welcome Step
  if (step === "welcome") {
    return (
      <div className="flex flex-col h-[480px]">
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-4 pb-2">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === currentIndex ? "bg-[#32d74b] w-4" : i < currentIndex ? "bg-[#32d74b]" : "bg-[#2a2a2f]"
              }`}
            />
          ))}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          {/* Animated logo */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-[22px] bg-gradient-to-b from-[#1a1a1f] to-[#141417] border border-[rgba(255,255,255,0.08)] flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <div className="relative">
                {/* Bridge icon */}
                <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
                  {/* Left platform */}
                  <rect x="4" y="24" width="8" height="12" rx="2" fill="#636366" />
                  {/* Right platform */}
                  <rect x="28" y="24" width="8" height="12" rx="2" fill="#636366" />
                  {/* Bridge arc */}
                  <path d="M8 26 Q20 8 32 26" stroke="#32d74b" strokeWidth="3" strokeLinecap="round" fill="none" />
                  {/* Connection nodes */}
                  <circle cx="8" cy="26" r="2.5" fill="#32d74b" />
                  <circle cx="32" cy="26" r="2.5" fill="#32d74b" />
                  <circle cx="20" cy="14" r="3" fill="#32d74b" />
                </svg>
              </div>
            </div>
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-[22px] bg-[#32d74b] opacity-10 blur-xl" />
          </div>

          <h1 className="text-[22px] font-semibold tracking-tight mb-2">
            Welcome to CCB
          </h1>
          <p className="text-[13px] text-[#8e8e93] leading-relaxed max-w-[260px]">
            Bridge your messaging apps to Claude Code. Chat from Telegram or Discord, powered by AI.
          </p>

          {/* Feature highlights */}
          <div className="mt-6 space-y-2 w-full max-w-[240px]">
            <FeatureRow icon="💬" text="Chat from anywhere" />
            <FeatureRow icon="🤖" text="Powered by Claude" />
            <FeatureRow icon="🔒" text="Secure pairing system" />
          </div>
        </div>

        {/* Bottom actions */}
        <div className="p-4 border-t border-[rgba(255,255,255,0.06)]">
          <button
            onClick={() => setStep("bots")}
            className="w-full py-3 rounded-xl text-[14px] font-medium bg-[#32d74b] text-[#0d0d0f] hover:bg-[#30d158] transition-all shadow-[0_0_20px_rgba(50,215,75,0.2)]"
          >
            Get Started
          </button>
        </div>
      </div>
    );
  }

  // Bots Step
  if (step === "bots") {
    return (
      <div className="flex flex-col h-[480px]">
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-4 pb-2">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === currentIndex ? "bg-[#32d74b] w-4" : i < currentIndex ? "bg-[#32d74b]" : "bg-[#2a2a2f]"
              }`}
            />
          ))}
        </div>

        {/* Header */}
        <div className="px-4 py-3">
          <button
            onClick={() => setStep("welcome")}
            className="flex items-center gap-1 text-[12px] text-[#636366] hover:text-[#8e8e93] mb-3"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          <h2 className="text-[17px] font-semibold">Connect Your Bots</h2>
          <p className="text-[12px] text-[#636366] mt-1">Add at least one bot to get started</p>
        </div>

        {/* Bot cards */}
        <div className="flex-1 overflow-y-auto px-4 space-y-3">
          {/* Telegram Card */}
          <BotCard
            platform="telegram"
            color="#0088cc"
            bots={telegramBots}
            setBots={setTelegramBots}
            helpSteps={[
              "Open Telegram → @BotFather",
              "Send /newbot and follow prompts",
              "Copy the bot token here"
            ]}
          />

          {/* Discord Card */}
          <BotCard
            platform="discord"
            color="#5865f2"
            bots={discordBots}
            setBots={setDiscordBots}
            helpSteps={[
              "Go to discord.com/developers",
              "Create app → Bot → Reset Token",
              "Copy token and invite bot to server"
            ]}
          />
        </div>

        {/* Bottom actions */}
        <div className="p-4 border-t border-[rgba(255,255,255,0.06)]">
          <button
            onClick={() => setStep("agents")}
            disabled={!hasBots}
            className={`w-full py-3 rounded-xl text-[14px] font-medium transition-all ${
              hasBots
                ? "bg-[#32d74b] text-[#0d0d0f] hover:bg-[#30d158] shadow-[0_0_20px_rgba(50,215,75,0.2)]"
                : "bg-[#1a1a1f] text-[#636366] cursor-not-allowed"
            }`}
          >
            Continue
          </button>
          <p className="text-[11px] text-[#636366] text-center mt-2">
            {hasBots ? "Ready to configure agents" : "Add at least one bot token"}
          </p>
        </div>
      </div>
    );
  }

  // Agents Step
  if (step === "agents") {
    const defaultAgent: AgentConfig = {
      id: "claude",
      name: "Claude",
      workspace: "~",
    };

    const currentAgent = agents.length > 0 ? agents[0] : defaultAgent;

    const updateAgent = (updates: Partial<AgentConfig>) => {
      const updated = { ...currentAgent, ...updates };
      setAgents([updated]);
    };

    return (
      <div className="flex flex-col h-[480px]">
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-4 pb-2">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === currentIndex ? "bg-[#32d74b] w-4" : i < currentIndex ? "bg-[#32d74b]" : "bg-[#2a2a2f]"
              }`}
            />
          ))}
        </div>

        {/* Header */}
        <div className="px-4 py-3">
          <button
            onClick={() => setStep("bots")}
            className="flex items-center gap-1 text-[12px] text-[#636366] hover:text-[#8e8e93] mb-3"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          <h2 className="text-[17px] font-semibold">Configure Agent</h2>
          <p className="text-[12px] text-[#636366] mt-1">Set up where Claude works from</p>
        </div>

        {/* Agent config */}
        <div className="flex-1 overflow-y-auto px-4 space-y-4">
          {/* Workspace */}
          <div className="bg-[#141417] rounded-xl p-4 border border-[rgba(255,255,255,0.06)]">
            <label className="block text-[11px] text-[#636366] uppercase tracking-wider mb-2">
              Working Directory
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={currentAgent.workspace}
                onChange={(e) => updateAgent({ workspace: e.target.value })}
                placeholder="~/projects"
                className="flex-1 px-3 py-2.5 rounded-lg bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[13px] font-mono placeholder:text-[#636366] focus:outline-none focus:border-[#32d74b] transition-colors"
              />
              <button
                onClick={async () => {
                  try {
                    const selected = await open({ directory: true, multiple: false, title: "Select Workspace" });
                    if (selected) updateAgent({ workspace: selected as string });
                  } catch (e) {
                    console.error("Folder picker error:", e);
                  }
                }}
                className="px-3 py-2.5 rounded-lg bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[12px] text-[#8e8e93] hover:text-[#e8e8ed] hover:border-[#32d74b] transition-colors"
              >
                Browse
              </button>
            </div>
            <p className="text-[10px] text-[#636366] mt-2">
              Claude will have access to files in this directory
            </p>
          </div>

          {/* Advanced options (collapsed by default) */}
          <details className="group">
            <summary className="cursor-pointer text-[12px] text-[#636366] hover:text-[#8e8e93] flex items-center gap-2">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
              Advanced Options
            </summary>
            <div className="mt-3 space-y-3">
              {/* Model */}
              <div className="bg-[#141417] rounded-xl p-4 border border-[rgba(255,255,255,0.06)]">
                <label className="block text-[11px] text-[#636366] uppercase tracking-wider mb-2">
                  Model
                </label>
                <select
                  value={currentAgent.model || ""}
                  onChange={(e) => updateAgent({ model: e.target.value || undefined })}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[13px] focus:outline-none focus:border-[#32d74b] transition-colors appearance-none"
                >
                  <option value="">Default (Sonnet)</option>
                  <option value="sonnet">Claude Sonnet 4.5</option>
                  <option value="opus">Claude Opus 4.5</option>
                </select>
              </div>

              {/* Permission Mode */}
              <div className="bg-[#141417] rounded-xl p-4 border border-[rgba(255,255,255,0.06)]">
                <label className="block text-[11px] text-[#636366] uppercase tracking-wider mb-2">
                  Permission Mode
                </label>
                <select
                  value={currentAgent.permissionMode || "default"}
                  onChange={(e) => updateAgent({ permissionMode: e.target.value === "default" ? undefined : e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[13px] focus:outline-none focus:border-[#32d74b] transition-colors appearance-none"
                >
                  <option value="default">Default (ask for permissions)</option>
                  <option value="acceptEdits">Accept Edits (auto-approve file changes)</option>
                  <option value="bypassPermissions">Bypass (fully automated)</option>
                </select>
                <p className="text-[10px] text-[#ff9f0a] mt-2">
                  {currentAgent.permissionMode === "bypassPermissions" && "⚠️ Use with caution - Claude can execute any action"}
                </p>
              </div>

              {/* System Prompt */}
              <div className="bg-[#141417] rounded-xl p-4 border border-[rgba(255,255,255,0.06)]">
                <label className="block text-[11px] text-[#636366] uppercase tracking-wider mb-2">
                  System Prompt (optional)
                </label>
                <textarea
                  value={currentAgent.systemPrompt || ""}
                  onChange={(e) => updateAgent({ systemPrompt: e.target.value || undefined })}
                  placeholder="Custom instructions for Claude..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[12px] placeholder:text-[#636366] focus:outline-none focus:border-[#32d74b] transition-colors resize-none"
                />
              </div>
            </div>
          </details>
        </div>

        {/* Bottom actions */}
        <div className="p-4 border-t border-[rgba(255,255,255,0.06)]">
          <button
            onClick={() => setStep("complete")}
            className="w-full py-3 rounded-xl text-[14px] font-medium bg-[#32d74b] text-[#0d0d0f] hover:bg-[#30d158] transition-all shadow-[0_0_20px_rgba(50,215,75,0.2)]"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Complete Step
  if (step === "complete") {
    const tgCount = telegramBots.filter(b => b.token).length;
    const dcCount = discordBots.filter(b => b.token).length;

    return (
      <div className="flex flex-col h-[480px]">
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-4 pb-2">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === currentIndex ? "bg-[#32d74b] w-4" : i < currentIndex ? "bg-[#32d74b]" : "bg-[#2a2a2f]"
              }`}
            />
          ))}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          {/* Success animation */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full bg-[#32d74b] flex items-center justify-center shadow-[0_0_40px_rgba(50,215,75,0.4)]">
              <svg className="w-10 h-10 text-[#0d0d0f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <h1 className="text-[22px] font-semibold tracking-tight mb-2">Ready to Connect</h1>
          <p className="text-[13px] text-[#8e8e93] leading-relaxed max-w-[260px]">
            Your bridge is configured and ready to start.
          </p>

          {/* Summary */}
          <div className="mt-6 w-full max-w-[260px] bg-[#141417] rounded-xl p-4 border border-[rgba(255,255,255,0.06)]">
            <div className="space-y-2 text-left">
              {tgCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#8e8e93]">Telegram</span>
                  <span className="text-[12px] text-[#0088cc] font-medium">{tgCount} bot{tgCount !== 1 ? "s" : ""}</span>
                </div>
              )}
              {dcCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#8e8e93]">Discord</span>
                  <span className="text-[12px] text-[#5865f2] font-medium">{dcCount} bot{dcCount !== 1 ? "s" : ""}</span>
                </div>
              )}
              <div className="pt-2 border-t border-[rgba(255,255,255,0.06)]">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#8e8e93]">Agent</span>
                  <span className="text-[12px] text-[#32d74b] font-medium">{agents[0]?.name || "Claude"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        <div className="p-4 border-t border-[rgba(255,255,255,0.06)]">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="w-full py-3 rounded-xl text-[14px] font-medium bg-[#32d74b] text-[#0d0d0f] hover:bg-[#30d158] transition-all shadow-[0_0_20px_rgba(50,215,75,0.2)] disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Start Bridge"}
          </button>
          <button
            onClick={() => setStep("agents")}
            className="w-full mt-2 py-2 text-[13px] text-[#636366] hover:text-[#8e8e93] transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// Settings Panel Component (for existing users)
function SettingsPanel({
  tab,
  setTab,
  telegramBots,
  setTelegramBots,
  discordBots,
  setDiscordBots,
  agents,
  setAgents,
  onSave,
  onClose,
  isSaving,
  isRunning,
}: {
  tab: SettingsTab;
  setTab: (t: SettingsTab) => void;
  telegramBots: BotConfig[];
  setTelegramBots: (bots: BotConfig[]) => void;
  discordBots: BotConfig[];
  setDiscordBots: (bots: BotConfig[]) => void;
  agents: AgentConfig[];
  setAgents: (agents: AgentConfig[]) => void;
  onSave: () => void;
  onClose: () => void;
  isSaving: boolean;
  isRunning: boolean;
}) {
  const [editingBot, setEditingBot] = useState<{ platform: "telegram" | "discord"; index: number } | null>(null);
  const [editingAgent, setEditingAgent] = useState<number | null>(null);
  const [showAddBot, setShowAddBot] = useState<"telegram" | "discord" | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);

  // New bot form state
  const [newBotId, setNewBotId] = useState("");
  const [newBotToken, setNewBotToken] = useState("");
  const [newBotAgentId, setNewBotAgentId] = useState("");

  // New agent form state
  const [newAgent, setNewAgent] = useState<AgentConfig>({
    id: "",
    name: "",
    workspace: "~",
  });

  const addBot = (platform: "telegram" | "discord") => {
    if (!newBotToken.trim()) return;
    const bot: BotConfig = {
      id: newBotId.trim() || `bot-${Date.now()}`,
      token: newBotToken.trim(),
      agentId: newBotAgentId.trim() || undefined,
    };
    if (platform === "telegram") {
      setTelegramBots([...telegramBots, bot]);
    } else {
      setDiscordBots([...discordBots, bot]);
    }
    setNewBotId("");
    setNewBotToken("");
    setNewBotAgentId("");
    setShowAddBot(null);
  };

  const removeBot = (platform: "telegram" | "discord", index: number) => {
    if (platform === "telegram") {
      setTelegramBots(telegramBots.filter((_, i) => i !== index));
    } else {
      setDiscordBots(discordBots.filter((_, i) => i !== index));
    }
  };

  const updateBot = (platform: "telegram" | "discord", index: number, updates: Partial<BotConfig>) => {
    if (platform === "telegram") {
      const updated = [...telegramBots];
      updated[index] = { ...updated[index], ...updates };
      setTelegramBots(updated);
    } else {
      const updated = [...discordBots];
      updated[index] = { ...updated[index], ...updates };
      setDiscordBots(updated);
    }
  };

  const addAgent = async () => {
    if (!newAgent.id.trim() || !newAgent.workspace.trim()) return;
    try {
      await invoke("add_agent", { agent: newAgent });
      setAgents([...agents, newAgent]);
      setNewAgent({ id: "", name: "", workspace: "~" });
      setShowAddAgent(false);
    } catch (error) {
      console.error("Failed to add agent:", error);
    }
  };

  const removeAgent = async (index: number) => {
    const agent = agents[index];
    try {
      await invoke("remove_agent", { id: agent.id });
      setAgents(agents.filter((_, i) => i !== index));
    } catch (error) {
      console.error("Failed to remove agent:", error);
    }
  };

  // Use a ref to track the latest agent state to avoid race conditions
  const agentsRef = useRef(agents);
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  const updateAgent = async (index: number, updates: Partial<AgentConfig>) => {
    // Use the ref to get the latest state to avoid race conditions
    const currentAgents = agentsRef.current;
    const updated = { ...currentAgents[index], ...updates };

    // Update state immediately for responsive UI
    const newAgents = [...currentAgents];
    newAgents[index] = updated;
    setAgents(newAgents);
    agentsRef.current = newAgents; // Update ref immediately

    try {
      await invoke("update_agent", { agent: updated });
      console.log("Agent updated successfully:", updated);
    } catch (error) {
      console.error("Failed to update agent:", error);
      // Revert on error
      setAgents(currentAgents);
      agentsRef.current = currentAgents;
    }
  };

  return (
    <div className="flex flex-col h-[480px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          >
            <svg className="w-4 h-4 text-[#636366]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-[#141417] rounded-lg">
          <button
            onClick={() => setTab("bots")}
            className={`flex-1 py-1.5 px-3 rounded-md text-[12px] font-medium transition-all ${
              tab === "bots" ? "bg-[#1a1a1f] text-[#e8e8ed]" : "text-[#636366] hover:text-[#8e8e93]"
            }`}
          >
            Bots
          </button>
          <button
            onClick={() => setTab("agents")}
            className={`flex-1 py-1.5 px-3 rounded-md text-[12px] font-medium transition-all ${
              tab === "agents" ? "bg-[#1a1a1f] text-[#e8e8ed]" : "text-[#636366] hover:text-[#8e8e93]"
            }`}
          >
            Agents
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "bots" && (
          <div className="space-y-4">
            {/* Telegram Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#0088cc]/20 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-[#0088cc]">TG</span>
                  </div>
                  <span className="text-[12px] font-medium">Telegram</span>
                </div>
                <button
                  onClick={() => setShowAddBot("telegram")}
                  className="text-[11px] text-[#0088cc] hover:text-[#0099dd] transition-colors"
                >
                  + Add Bot
                </button>
              </div>

              {telegramBots.filter(b => b.token).length === 0 && !showAddBot ? (
                <p className="text-[11px] text-[#636366] py-2">No Telegram bots configured</p>
              ) : (
                <div className="space-y-2">
                  {telegramBots.filter(b => b.token).map((bot, index) => (
                    <div key={index} className="bg-[#141417] rounded-lg p-3 border border-[rgba(255,255,255,0.06)]">
                      {editingBot?.platform === "telegram" && editingBot.index === index ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={bot.id}
                            onChange={(e) => updateBot("telegram", index, { id: e.target.value })}
                            placeholder="Bot ID"
                            className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                          />
                          <input
                            type="password"
                            value={bot.token}
                            onChange={(e) => updateBot("telegram", index, { token: e.target.value })}
                            placeholder="Token"
                            className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingBot(null)}
                              className="flex-1 py-1.5 rounded text-[11px] font-medium bg-[#0088cc] text-white"
                            >
                              Done
                            </button>
                            <button
                              onClick={() => removeBot("telegram", index)}
                              className="py-1.5 px-3 rounded text-[11px] text-[#ff453a] hover:bg-[rgba(255,69,58,0.1)]"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[12px] font-medium">{bot.id}</div>
                            <div className="text-[10px] text-[#636366] font-mono">
                              {bot.token.slice(0, 10)}...{bot.token.slice(-4)}
                            </div>
                          </div>
                          <button
                            onClick={() => setEditingBot({ platform: "telegram", index })}
                            className="text-[10px] text-[#636366] hover:text-[#8e8e93]"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showAddBot === "telegram" && (
                <div className="bg-[#141417] rounded-lg p-3 border border-[#0088cc]/30 mt-2 space-y-2">
                  <input
                    type="text"
                    value={newBotId}
                    onChange={(e) => setNewBotId(e.target.value)}
                    placeholder="Bot ID (optional)"
                    className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                  />
                  <input
                    type="password"
                    value={newBotToken}
                    onChange={(e) => setNewBotToken(e.target.value)}
                    placeholder="Bot Token (required)"
                    className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                  />
                  <select
                    value={newBotAgentId}
                    onChange={(e) => setNewBotAgentId(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px]"
                  >
                    <option value="">Default Agent</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name || a.id}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => addBot("telegram")}
                      disabled={!newBotToken.trim()}
                      className="flex-1 py-1.5 rounded text-[11px] font-medium bg-[#0088cc] text-white disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowAddBot(null); setNewBotToken(""); setNewBotId(""); }}
                      className="py-1.5 px-3 rounded text-[11px] text-[#636366]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Discord Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#5865f2]/20 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-[#5865f2]">DC</span>
                  </div>
                  <span className="text-[12px] font-medium">Discord</span>
                </div>
                <button
                  onClick={() => setShowAddBot("discord")}
                  className="text-[11px] text-[#5865f2] hover:text-[#6b73f7] transition-colors"
                >
                  + Add Bot
                </button>
              </div>

              {discordBots.filter(b => b.token).length === 0 && showAddBot !== "discord" ? (
                <p className="text-[11px] text-[#636366] py-2">No Discord bots configured</p>
              ) : (
                <div className="space-y-2">
                  {discordBots.filter(b => b.token).map((bot, index) => (
                    <div key={index} className="bg-[#141417] rounded-lg p-3 border border-[rgba(255,255,255,0.06)]">
                      {editingBot?.platform === "discord" && editingBot.index === index ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={bot.id}
                            onChange={(e) => updateBot("discord", index, { id: e.target.value })}
                            placeholder="Bot ID"
                            className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                          />
                          <input
                            type="password"
                            value={bot.token}
                            onChange={(e) => updateBot("discord", index, { token: e.target.value })}
                            placeholder="Token"
                            className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingBot(null)}
                              className="flex-1 py-1.5 rounded text-[11px] font-medium bg-[#5865f2] text-white"
                            >
                              Done
                            </button>
                            <button
                              onClick={() => removeBot("discord", index)}
                              className="py-1.5 px-3 rounded text-[11px] text-[#ff453a] hover:bg-[rgba(255,69,58,0.1)]"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[12px] font-medium">{bot.id}</div>
                            <div className="text-[10px] text-[#636366] font-mono">
                              {bot.token.slice(0, 10)}...{bot.token.slice(-4)}
                            </div>
                          </div>
                          <button
                            onClick={() => setEditingBot({ platform: "discord", index })}
                            className="text-[10px] text-[#636366] hover:text-[#8e8e93]"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showAddBot === "discord" && (
                <div className="bg-[#141417] rounded-lg p-3 border border-[#5865f2]/30 mt-2 space-y-2">
                  <input
                    type="text"
                    value={newBotId}
                    onChange={(e) => setNewBotId(e.target.value)}
                    placeholder="Bot ID (optional)"
                    className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                  />
                  <input
                    type="password"
                    value={newBotToken}
                    onChange={(e) => setNewBotToken(e.target.value)}
                    placeholder="Bot Token (required)"
                    className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                  />
                  <select
                    value={newBotAgentId}
                    onChange={(e) => setNewBotAgentId(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px]"
                  >
                    <option value="">Default Agent</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name || a.id}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => addBot("discord")}
                      disabled={!newBotToken.trim()}
                      className="flex-1 py-1.5 rounded text-[11px] font-medium bg-[#5865f2] text-white disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowAddBot(null); setNewBotToken(""); setNewBotId(""); }}
                      className="py-1.5 px-3 rounded text-[11px] text-[#636366]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "agents" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-[#8e8e93]">Claude Agents</span>
              <button
                onClick={() => setShowAddAgent(true)}
                className="text-[11px] text-[#32d74b] hover:text-[#30d158] transition-colors"
              >
                + Add Agent
              </button>
            </div>

            {agents.length === 0 && !showAddAgent ? (
              <p className="text-[11px] text-[#636366] py-2">No agents configured</p>
            ) : (
              <div className="space-y-2">
                {agents.map((agent, index) => (
                  <div key={agent.id} className="bg-[#141417] rounded-lg p-3 border border-[rgba(255,255,255,0.06)]">
                    {editingAgent === index ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={agent.name || ""}
                          onChange={(e) => updateAgent(index, { name: e.target.value })}
                          placeholder="Display Name"
                          className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px]"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={agent.workspace}
                            onChange={(e) => updateAgent(index, { workspace: e.target.value })}
                            placeholder="Workspace Path"
                            className="flex-1 px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                          />
                          <button
                            onClick={async () => {
                              try {
                                const selected = await open({ directory: true, multiple: false, title: "Select Workspace" });
                                if (selected) updateAgent(index, { workspace: selected as string });
                              } catch (e) {
                                console.error("Folder picker error:", e);
                              }
                            }}
                            className="px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] text-[#8e8e93] hover:text-[#e8e8ed]"
                          >
                            Browse
                          </button>
                        </div>
                        <select
                          value={agent.model || ""}
                          onChange={(e) => updateAgent(index, { model: e.target.value || undefined })}
                          className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px]"
                        >
                          <option value="">Default Model</option>
                          <option value="sonnet">Claude Sonnet 4.5</option>
                          <option value="opus">Claude Opus 4.5</option>
                        </select>
                        <select
                          value={agent.permissionMode || "default"}
                          onChange={(e) => updateAgent(index, { permissionMode: e.target.value === "default" ? undefined : e.target.value })}
                          className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px]"
                        >
                          <option value="default">Default (ask for permissions)</option>
                          <option value="acceptEdits">Accept Edits (auto-approve)</option>
                          <option value="bypassPermissions">Bypass (fully automated)</option>
                        </select>
                        <textarea
                          value={agent.systemPrompt || ""}
                          onChange={(e) => updateAgent(index, { systemPrompt: e.target.value || undefined })}
                          placeholder="System Prompt (optional)"
                          rows={2}
                          className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] resize-none"
                        />
                        {/* Tools Selection */}
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[9px] text-[#636366] uppercase tracking-wider mb-2">
                              Allowed Tools
                            </label>
                            <div className="grid grid-cols-2 gap-1 max-h-[120px] overflow-y-auto p-2 bg-[#0d0d0f] rounded-lg border border-[rgba(255,255,255,0.06)]">
                              {AVAILABLE_TOOLS.map(tool => {
                                const isAllowed = agent.allowedTools?.includes(tool.id);
                                const isDisallowed = agent.disallowedTools?.includes(tool.id);
                                return (
                                  <label
                                    key={tool.id}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors ${
                                      isAllowed ? "bg-[#32d74b]/20" : isDisallowed ? "bg-[#ff453a]/20" : "hover:bg-[rgba(255,255,255,0.04)]"
                                    }`}
                                    title={tool.description}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isAllowed || false}
                                      onChange={(e) => {
                                        const current = agent.allowedTools || [];
                                        const disallowed = agent.disallowedTools || [];
                                        if (e.target.checked) {
                                          updateAgent(index, {
                                            allowedTools: [...current, tool.id],
                                            disallowedTools: disallowed.filter(t => t !== tool.id)
                                          });
                                        } else {
                                          updateAgent(index, {
                                            allowedTools: current.filter(t => t !== tool.id) || undefined
                                          });
                                        }
                                      }}
                                      className="w-3 h-3 rounded accent-[#32d74b]"
                                    />
                                    <span className="text-[10px] text-[#e8e8ed]">{tool.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                            <p className="text-[9px] text-[#636366] mt-1">Leave empty to allow all tools</p>
                          </div>

                          <div>
                            <label className="block text-[9px] text-[#636366] uppercase tracking-wider mb-2">
                              Disallowed Tools
                            </label>
                            <div className="grid grid-cols-2 gap-1 max-h-[100px] overflow-y-auto p-2 bg-[#0d0d0f] rounded-lg border border-[rgba(255,255,255,0.06)]">
                              {AVAILABLE_TOOLS.map(tool => {
                                const isDisallowed = agent.disallowedTools?.includes(tool.id);
                                const isAllowed = agent.allowedTools?.includes(tool.id);
                                return (
                                  <label
                                    key={tool.id}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors ${
                                      isDisallowed ? "bg-[#ff453a]/20" : "hover:bg-[rgba(255,255,255,0.04)]"
                                    } ${isAllowed ? "opacity-40" : ""}`}
                                    title={tool.description}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isDisallowed || false}
                                      disabled={isAllowed}
                                      onChange={(e) => {
                                        const current = agent.disallowedTools || [];
                                        if (e.target.checked) {
                                          updateAgent(index, { disallowedTools: [...current, tool.id] });
                                        } else {
                                          updateAgent(index, {
                                            disallowedTools: current.filter(t => t !== tool.id) || undefined
                                          });
                                        }
                                      }}
                                      className="w-3 h-3 rounded accent-[#ff453a]"
                                    />
                                    <span className="text-[10px] text-[#e8e8ed]">{tool.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <label className="block text-[9px] text-[#636366] uppercase tracking-wider mb-2">
                              Skills
                            </label>
                            <div className="flex flex-wrap gap-1 p-2 bg-[#0d0d0f] rounded-lg border border-[rgba(255,255,255,0.06)]">
                              {AVAILABLE_SKILLS.map(skill => {
                                const isSelected = agent.skills?.includes(skill.id);
                                return (
                                  <label
                                    key={skill.id}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors ${
                                      isSelected ? "bg-[#fbbf24]/20" : "hover:bg-[rgba(255,255,255,0.04)]"
                                    }`}
                                    title={skill.description}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected || false}
                                      onChange={(e) => {
                                        const current = agent.skills || [];
                                        if (e.target.checked) {
                                          updateAgent(index, { skills: [...current, skill.id] });
                                        } else {
                                          updateAgent(index, {
                                            skills: current.filter(s => s !== skill.id) || undefined
                                          });
                                        }
                                      }}
                                      className="w-3 h-3 rounded accent-[#fbbf24]"
                                    />
                                    <span className="text-[10px] text-[#e8e8ed]">{skill.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingAgent(null)}
                            className="flex-1 py-1.5 rounded text-[11px] font-medium bg-[#32d74b] text-[#0d0d0f]"
                          >
                            Done
                          </button>
                          {agents.length > 1 && (
                            <button
                              onClick={() => removeAgent(index)}
                              className="py-1.5 px-3 rounded text-[11px] text-[#ff453a] hover:bg-[rgba(255,69,58,0.1)]"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[12px] font-medium">{agent.name || agent.id}</div>
                          <div className="text-[10px] text-[#636366] font-mono">{agent.workspace}</div>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {agent.model && <span className="text-[9px] text-[#32d74b]">{agent.model.split('-').slice(-2, -1)[0]}</span>}
                            {agent.allowedTools && agent.allowedTools.length > 0 && (
                              <span className="text-[9px] text-[#38bdf8]">{agent.allowedTools.length} tools</span>
                            )}
                            {agent.skills && agent.skills.length > 0 && (
                              <span className="text-[9px] text-[#fbbf24]">{agent.skills.length} skills</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setEditingAgent(index)}
                          className="text-[10px] text-[#636366] hover:text-[#8e8e93]"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showAddAgent && (
              <div className="bg-[#141417] rounded-lg p-3 border border-[#32d74b]/30 space-y-2">
                <input
                  type="text"
                  value={newAgent.id}
                  onChange={(e) => setNewAgent({ ...newAgent, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  placeholder="agent-id (no spaces)"
                  className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                />
                <input
                  type="text"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                  placeholder="Display Name"
                  className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px]"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAgent.workspace}
                    onChange={(e) => setNewAgent({ ...newAgent, workspace: e.target.value })}
                    placeholder="Workspace Path"
                    className="flex-1 px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] font-mono"
                  />
                  <button
                    onClick={async () => {
                      try {
                        const selected = await open({ directory: true, multiple: false, title: "Select Workspace" });
                        if (selected) setNewAgent({ ...newAgent, workspace: selected as string });
                      } catch (e) {
                        console.error("Folder picker error:", e);
                      }
                    }}
                    className="px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px] text-[#8e8e93] hover:text-[#e8e8ed]"
                  >
                    Browse
                  </button>
                </div>

                {/* Model selection */}
                <select
                  value={newAgent.model || ""}
                  onChange={(e) => setNewAgent({ ...newAgent, model: e.target.value || undefined })}
                  className="w-full px-2 py-1.5 rounded bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[11px]"
                >
                  <option value="">Default Model</option>
                  <option value="sonnet">Claude Sonnet 4.5</option>
                  <option value="opus">Claude Opus 4.5</option>
                </select>

                {/* Tools Selection */}
                <div>
                  <label className="block text-[9px] text-[#636366] uppercase tracking-wider mb-2">
                    Allowed Tools
                  </label>
                  <div className="grid grid-cols-2 gap-1 max-h-[100px] overflow-y-auto p-2 bg-[#0d0d0f] rounded-lg border border-[rgba(255,255,255,0.06)]">
                    {AVAILABLE_TOOLS.map(tool => {
                      const isAllowed = newAgent.allowedTools?.includes(tool.id);
                      return (
                        <label
                          key={tool.id}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors ${
                            isAllowed ? "bg-[#32d74b]/20" : "hover:bg-[rgba(255,255,255,0.04)]"
                          }`}
                          title={tool.description}
                        >
                          <input
                            type="checkbox"
                            checked={isAllowed || false}
                            onChange={(e) => {
                              const current = newAgent.allowedTools || [];
                              if (e.target.checked) {
                                setNewAgent({ ...newAgent, allowedTools: [...current, tool.id] });
                              } else {
                                setNewAgent({ ...newAgent, allowedTools: current.filter(t => t !== tool.id) });
                              }
                            }}
                            className="w-3 h-3 rounded accent-[#32d74b]"
                          />
                          <span className="text-[10px] text-[#e8e8ed]">{tool.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-[#636366] mt-1">Leave empty to allow all tools</p>
                </div>

                {/* Skills Selection */}
                <div>
                  <label className="block text-[9px] text-[#636366] uppercase tracking-wider mb-2">
                    Skills
                  </label>
                  <div className="flex flex-wrap gap-1 p-2 bg-[#0d0d0f] rounded-lg border border-[rgba(255,255,255,0.06)]">
                    {AVAILABLE_SKILLS.map(skill => {
                      const isSelected = newAgent.skills?.includes(skill.id);
                      return (
                        <label
                          key={skill.id}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors ${
                            isSelected ? "bg-[#fbbf24]/20" : "hover:bg-[rgba(255,255,255,0.04)]"
                          }`}
                          title={skill.description}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected || false}
                            onChange={(e) => {
                              const current = newAgent.skills || [];
                              if (e.target.checked) {
                                setNewAgent({ ...newAgent, skills: [...current, skill.id] });
                              } else {
                                setNewAgent({ ...newAgent, skills: current.filter(s => s !== skill.id) });
                              }
                            }}
                            className="w-3 h-3 rounded accent-[#fbbf24]"
                          />
                          <span className="text-[10px] text-[#e8e8ed]">{skill.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={addAgent}
                    disabled={!newAgent.id.trim() || !newAgent.workspace.trim()}
                    className="flex-1 py-1.5 rounded text-[11px] font-medium bg-[#32d74b] text-[#0d0d0f] disabled:opacity-50"
                  >
                    Add Agent
                  </button>
                  <button
                    onClick={() => { setShowAddAgent(false); setNewAgent({ id: "", name: "", workspace: "~" }); }}
                    className="py-1.5 px-3 rounded text-[11px] text-[#636366]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[rgba(255,255,255,0.06)]">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="w-full py-2.5 rounded-xl text-[13px] font-medium bg-[#32d74b] text-[#0d0d0f] hover:bg-[#30d158] transition-all disabled:opacity-50"
        >
          {isSaving ? "Saving..." : isRunning ? "Save & Restart" : "Save Changes"}
        </button>
        <p className="text-[10px] text-[#636366] text-center mt-2">
          {isRunning ? "Restart required to apply changes" : "Changes will take effect on next start"}
        </p>
      </div>
    </div>
  );
}

// Helper Components

function FeatureRow({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#141417] border border-[rgba(255,255,255,0.04)]">
      <span className="text-[14px]">{icon}</span>
      <span className="text-[12px] text-[#8e8e93]">{text}</span>
    </div>
  );
}

function BotCard({
  platform,
  color,
  bots,
  setBots,
  helpSteps,
}: {
  platform: "telegram" | "discord";
  color: string;
  bots: BotConfig[];
  setBots: (bots: BotConfig[]) => void;
  helpSteps: string[];
}) {
  const [expanded, setExpanded] = useState(bots.some(b => b.token));
  const hasToken = bots.some(b => b.token);

  const updateBot = (index: number, token: string) => {
    const updated = [...bots];
    updated[index] = { ...updated[index], token };
    setBots(updated);
  };

  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
  const icon = platform === "telegram" ? "TG" : "DC";

  return (
    <div className={`rounded-xl border transition-all ${hasToken ? `border-[${color}]/30 bg-[${color}]/5` : "border-[rgba(255,255,255,0.06)] bg-[#141417]"}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3"
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center`} style={{ backgroundColor: `${color}20` }}>
          <span className="text-[12px] font-bold" style={{ color }}>{icon}</span>
        </div>
        <div className="flex-1 text-left">
          <div className="text-[13px] font-medium">{platformName}</div>
          <div className="text-[11px] text-[#636366]">
            {hasToken ? `${bots.filter(b => b.token).length} bot configured` : "Not configured"}
          </div>
        </div>
        {hasToken && (
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: color }}>
            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        <svg className={`w-4 h-4 text-[#636366] transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Help text */}
          <div className="p-3 rounded-lg bg-[#0d0d0f] border border-[rgba(255,255,255,0.04)]">
            <p className="text-[11px] text-[#636366] mb-2">How to get a token:</p>
            <ol className="space-y-1">
              {helpSteps.map((step, i) => (
                <li key={i} className="flex gap-2 text-[11px] text-[#8e8e93]">
                  <span style={{ color }} className="font-mono">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Token input */}
          <div>
            <label className="block text-[10px] text-[#636366] uppercase tracking-wider mb-1.5">Bot Token</label>
            <input
              type="password"
              value={bots[0]?.token || ""}
              onChange={(e) => updateBot(0, e.target.value)}
              placeholder={platform === "telegram" ? "123456789:ABCdefGHI..." : "MTIzNDU2Nzg5..."}
              className="w-full px-3 py-2.5 rounded-lg bg-[#1a1a1f] border border-[rgba(255,255,255,0.1)] text-[12px] font-mono placeholder:text-[#636366] focus:outline-none transition-colors"
              style={{ borderColor: bots[0]?.token ? color : undefined }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-[20px] font-semibold font-mono text-[#e8e8ed] tracking-tight">{value}</div>
      <div className="text-[10px] text-[#636366] uppercase tracking-wider">{label}</div>
    </div>
  );
}

function SectionHeader({ title, count, accent }: { title: string; count?: number; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold text-[#636366] uppercase tracking-wider">{title}</span>
      {count !== undefined && (
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            accent ? "bg-[#ff9f0a] text-[#0d0d0f]" : "bg-[#1a1a1f] text-[#8e8e93]"
          }`}
        >
          {count}
        </span>
      )}
    </div>
  );
}

function PairingCard({
  pairing,
  onApprove,
  onDeny,
}: {
  pairing: PairingRequest;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="bg-[#141417] rounded-lg border border-[#ff9f0a]/30 p-3">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-medium text-[13px] text-[#e8e8ed]">
            {pairing.userInfo.displayName || pairing.userInfo.username || pairing.userInfo.id}
          </div>
          <div className="text-[11px] text-[#636366] font-mono mt-0.5">
            {pairing.userInfo.channel} · {pairing.code}
          </div>
        </div>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#ff9f0a]/20 text-[#ff9f0a]">
          {channelIcons[pairing.userInfo.channel] || pairing.userInfo.channel[0].toUpperCase()}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="flex-1 py-1.5 rounded-md text-[12px] font-medium bg-[#32d74b] text-[#0d0d0f] hover:bg-[#30d158] transition-colors"
        >
          Approve
        </button>
        <button
          onClick={onDeny}
          className="flex-1 py-1.5 rounded-md text-[12px] font-medium bg-[#1a1a1f] text-[#8e8e93] border border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)] transition-colors"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

function ChannelCard({ channel }: { channel: ChannelStatus }) {
  return (
    <div className="bg-[#141417] rounded-lg border border-[rgba(255,255,255,0.06)] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1a1a1f] flex items-center justify-center">
            <span className="text-[11px] font-bold text-[#8e8e93]">
              {channelIcons[channel.name] || channel.name[0].toUpperCase()}
            </span>
          </div>
          <div>
            <div className="font-medium text-[13px] capitalize">{channel.name}</div>
            <div className="text-[11px] text-[#636366]">
              {channel.botCount} bot{channel.botCount !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <div className={`w-2 h-2 rounded-full ${channel.connected ? "bg-[#32d74b]" : "bg-[#636366]"}`} />
      </div>

      {channel.bots.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.04)] space-y-1">
          {channel.bots.map((bot) => (
            <div key={bot.id} className="flex items-center justify-between text-[11px]">
              <span className="text-[#8e8e93] font-mono">{bot.username || bot.id}</span>
              {bot.agentId && <span className="text-[#636366]">→ {bot.agentId}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
