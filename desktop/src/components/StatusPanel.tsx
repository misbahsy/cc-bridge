interface BridgeStatus {
  running: boolean;
  uptime: number;
  channels: Array<{
    name: string;
    enabled: boolean;
    connected: boolean;
    botCount: number;
  }>;
  sessions: { active: number; total: number };
  pairings: { pending: number };
}

interface StatusPanelProps {
  status: BridgeStatus | null;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export default function StatusPanel({ status }: StatusPanelProps) {
  if (!status) {
    return (
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center gap-2 text-gray-500">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-sm">Bridge is not running</span>
        </div>
      </div>
    );
  }

  const connectedChannels = status.channels.filter((c) => c.connected).length;
  const totalBots = status.channels.reduce((sum, c) => sum + c.botCount, 0);

  return (
    <div className="bg-green-50 rounded-lg p-3 border border-green-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-green-800">Running</span>
        </div>
        <span className="text-xs text-green-600">
          {formatUptime(status.uptime)}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold text-gray-800">
            {connectedChannels}
          </div>
          <div className="text-xs text-gray-500">Channels</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-gray-800">{totalBots}</div>
          <div className="text-xs text-gray-500">Bots</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-gray-800">
            {status.sessions.active}
          </div>
          <div className="text-xs text-gray-500">Sessions</div>
        </div>
      </div>
    </div>
  );
}
