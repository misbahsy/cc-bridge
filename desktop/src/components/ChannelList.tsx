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

interface ChannelListProps {
  channels: ChannelStatus[];
}

const channelIcons: Record<string, string> = {
  telegram: "TG",
  discord: "DC",
};

const channelColors: Record<string, { bg: string; text: string }> = {
  telegram: { bg: "bg-blue-100", text: "text-blue-600" },
  discord: { bg: "bg-indigo-100", text: "text-indigo-600" },
};

export default function ChannelList({ channels }: ChannelListProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Channels
      </h3>
      <div className="space-y-2">
        {channels.map((channel) => {
          const colors = channelColors[channel.name] || {
            bg: "bg-gray-100",
            text: "text-gray-600",
          };

          return (
            <div
              key={channel.name}
              className="bg-white rounded-lg border border-gray-200 p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-8 h-8 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center text-xs font-bold`}
                  >
                    {channelIcons[channel.name] || channel.name[0].toUpperCase()}
                  </span>
                  <div>
                    <div className="font-medium text-gray-800 capitalize">
                      {channel.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {channel.botCount} bot{channel.botCount !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <div
                  className={`w-2 h-2 rounded-full ${
                    channel.connected ? "bg-green-500" : "bg-gray-400"
                  }`}
                />
              </div>

              {channel.bots.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                  {channel.bots.map((bot) => (
                    <div
                      key={bot.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-gray-600">
                        {bot.username || bot.id}
                      </span>
                      {bot.agentId && (
                        <span className="text-gray-400">
                          → {bot.agentId}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
