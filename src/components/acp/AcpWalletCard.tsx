"use client";

import { Wallet } from "lucide-react";

interface AcpWalletCardProps {
  wallet: {
    usdcBalance?: number | null;
    ethBalance?: number | null;
    cbbtcBalance?: number | null;
    cbbtcValueUsd?: number | null;
    totalValueUsd?: number | null;
    snapshotAt?: string | null;
  } | null;
}

export function AcpWalletCard({ wallet }: AcpWalletCardProps) {
  if (!wallet) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Wallet</h3>
        </div>
        <div className="text-gray-400 text-sm">No wallet data</div>
      </div>
    );
  }

  const totalValue =
    wallet.totalValueUsd ??
    (wallet.usdcBalance ?? 0) +
      (wallet.cbbtcBalance ?? 0) * (wallet.cbbtcValueUsd ?? 0);

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Wallet</h3>
        </div>
        {wallet.snapshotAt && (
          <span className="text-xs text-gray-400">
            {formatRelativeTime(wallet.snapshotAt)}
          </span>
        )}
      </div>

      <div className="text-2xl font-bold text-gray-900 mb-3">
        ${totalValue.toFixed(2)}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">USDC</span>
          <span className="font-mono text-gray-900">
            ${(wallet.usdcBalance ?? 0).toFixed(2)}
          </span>
        </div>
        {(wallet.ethBalance ?? 0) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">ETH</span>
            <span className="font-mono text-gray-900">
              {(wallet.ethBalance ?? 0).toFixed(6)}
            </span>
          </div>
        )}
        {(wallet.cbbtcBalance ?? 0) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">cbBTC</span>
            <span className="font-mono text-gray-900">
              {(wallet.cbbtcBalance ?? 0).toFixed(8)}
              <span className="text-gray-400 ml-1">
                (${((wallet.cbbtcBalance ?? 0) * (wallet.cbbtcValueUsd ?? 0)).toFixed(2)})
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
