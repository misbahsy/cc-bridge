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

interface PairingListProps {
  pairings: PairingRequest[];
  onApprove: (code: string) => void;
  onDeny: (code: string) => void;
}

export default function PairingList({
  pairings,
  onApprove,
  onDeny,
}: PairingListProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
        Pairing Requests
        <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">
          {pairings.length}
        </span>
      </h3>
      <div className="space-y-2">
        {pairings.map((pairing) => (
          <div
            key={pairing.code}
            className="bg-orange-50 rounded-lg border border-orange-200 p-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-gray-800">
                  {pairing.userInfo.displayName ||
                    pairing.userInfo.username ||
                    pairing.userInfo.id}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {pairing.userInfo.channel} • Code: {pairing.code}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => onApprove(pairing.code)}
                className="flex-1 px-3 py-1.5 bg-green-500 text-white text-sm font-medium rounded-md hover:bg-green-600 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => onDeny(pairing.code)}
                className="flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-300 transition-colors"
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
