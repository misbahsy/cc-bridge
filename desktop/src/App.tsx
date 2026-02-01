import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import StatusPanel from "./components/StatusPanel";
import PairingList from "./components/PairingList";
import ChannelList from "./components/ChannelList";

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

function App() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [pairings, setPairings] = useState<PairingRequest[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [lastPairingCount, setLastPairingCount] = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await invoke<BridgeStatus | null>("get_status");
      setStatus(result);
    } catch (error) {
      console.error("Failed to fetch status:", error);
      setStatus(null);
    }
  }, []);

  const fetchPairings = useCallback(async () => {
    try {
      const result = await invoke<PairingRequest[]>("get_pairings");
      setPairings(result);

      // Send notification for new pairings
      if (result.length > lastPairingCount && lastPairingCount > 0) {
        const newPairing = result[0];
        const permitted = await isPermissionGranted();
        if (!permitted) {
          const permission = await requestPermission();
          if (permission !== "granted") return;
        }
        sendNotification({
          title: "New Pairing Request",
          body: `${newPairing.userInfo.username || newPairing.userInfo.id} from ${newPairing.userInfo.channel}`,
        });
      }
      setLastPairingCount(result.length);
    } catch (error) {
      console.error("Failed to fetch pairings:", error);
    }
  }, [lastPairingCount]);

  useEffect(() => {
    fetchStatus();
    fetchPairings();

    // Poll every 2 seconds
    const interval = setInterval(() => {
      fetchStatus();
      fetchPairings();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchPairings]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await invoke("start_service");
      // Wait a bit then refresh status
      setTimeout(fetchStatus, 3000);
    } catch (error) {
      console.error("Failed to start:", error);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await invoke("stop_service");
      setStatus(null);
    } catch (error) {
      console.error("Failed to stop:", error);
    }
  };

  const handleApprove = async (code: string) => {
    try {
      await invoke("approve_pairing", { code });
      fetchPairings();
    } catch (error) {
      console.error("Failed to approve:", error);
    }
  };

  const handleDeny = async (code: string) => {
    try {
      await invoke("deny_pairing", { code });
      fetchPairings();
    } catch (error) {
      console.error("Failed to deny:", error);
    }
  };

  const isRunning = status?.running ?? false;

  return (
    <div className="min-h-screen bg-white/95 backdrop-blur-xl rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">CCB</span>
            <span
              className={`w-2 h-2 rounded-full ${
                isRunning ? "bg-green-400" : "bg-gray-400"
              }`}
            />
          </div>
          <button
            onClick={isRunning ? handleStop : handleStart}
            disabled={isStarting}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              isRunning
                ? "bg-white/20 hover:bg-white/30"
                : "bg-white text-indigo-600 hover:bg-white/90"
            } ${isStarting ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {isStarting ? "Starting..." : isRunning ? "Stop" : "Start"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
        {/* Status Panel */}
        <StatusPanel status={status} />

        {/* Channels */}
        {status && status.channels.length > 0 && (
          <ChannelList channels={status.channels} />
        )}

        {/* Pairing Requests */}
        {pairings.length > 0 && (
          <PairingList
            pairings={pairings}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
        )}

        {/* Empty State */}
        {!isRunning && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">Click Start to begin</p>
            <p className="text-xs mt-1 text-gray-400">
              Connect with Telegram and Discord
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
        <span>
          {status
            ? `${status.sessions.active} active session${
                status.sessions.active !== 1 ? "s" : ""
              }`
            : "Not running"}
        </span>
        <span>v0.1.0</span>
      </div>
    </div>
  );
}

export default App;
