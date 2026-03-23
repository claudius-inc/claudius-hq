"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet, RefreshCw, TrendingUp, Coins, Bitcoin } from "lucide-react";

interface WalletBalance {
  symbol: string;
  name: string;
  balance: number;
  priceUsd: number;
  valueUsd: number;
}

interface WalletData {
  balances: WalletBalance[];
  summary: {
    totalValueUsd: number;
    usdc: number;
    eth: number;
    btc: number;
  };
}

export function WalletBalanceCard() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch("/api/acp/wallet");
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">ACP Wallet</h3>
        </div>
        <button
          onClick={fetchBalance}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
              <div className="h-6 bg-gray-200 rounded w-16"></div>
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium mb-1">
              <Coins className="w-3.5 h-3.5" />
              USDC
            </div>
            <div className="text-lg font-semibold text-gray-900">
              ${data.summary.usdc.toFixed(2)}
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-blue-700 text-xs font-medium mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              ETH
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {data.summary.eth.toFixed(6)}
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-orange-700 text-xs font-medium mb-1">
              <Bitcoin className="w-3.5 h-3.5" />
              cbBTC
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {data.summary.btc.toFixed(8)}
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-purple-700 text-xs font-medium mb-1">
              <Wallet className="w-3.5 h-3.5" />
              Total Value
            </div>
            <div className="text-lg font-semibold text-gray-900">
              ${data.summary.totalValueUsd.toFixed(2)}
            </div>
          </div>
        </div>
      ) : null}

      {data && data.balances.length > 4 && (
        <details className="mt-4">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
            View all {data.balances.length} tokens
          </summary>
          <div className="mt-2 text-xs text-gray-600 space-y-1">
            {data.balances.map((b) => (
              <div key={b.symbol} className="flex justify-between">
                <span>{b.symbol}</span>
                <span className="font-mono">{b.balance.toFixed(6)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
