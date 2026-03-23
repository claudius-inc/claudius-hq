"use client";

import { useState, useCallback } from "react";
import { RefreshCw, Link as LinkIcon } from "lucide-react";
import { AcpOfferingsTable } from "./AcpOfferingsTable";
import { WalletBalanceCard } from "./WalletBalanceCard";
import { RecentJobsTable } from "./RecentJobsTable";

interface Offering {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  isActive?: number | null;
  jobCount?: number | null;
  totalRevenue?: number | null;
  lastJobAt?: string | null;
  createdAt?: string | null;
}

interface OnChainRevenue {
  totalRevenue: number;
  jobCount: number;
  lastUpdated: string | null;
}

interface AcpOfferingsManagementProps {
  initialOfferings: Offering[];
  onChainRevenue?: OnChainRevenue;
}

export function AcpOfferingsManagement({ 
  initialOfferings,
  onChainRevenue: initialRevenue,
}: AcpOfferingsManagementProps) {
  const [offerings, setOfferings] = useState(initialOfferings);
  const [refreshKey, setRefreshKey] = useState(0);
  const [revenue, setRevenue] = useState(initialRevenue);
  const [syncing, setSyncing] = useState(false);

  const refreshOfferings = useCallback(async () => {
    try {
      const res = await fetch("/api/acp/offerings");
      
      if (res.ok) {
        const data = await res.json();
        setOfferings(data.offerings);
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      console.error("Failed to refresh offerings:", err);
    }
  }, []);

  const syncRevenue = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/acp/revenue", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRevenue({
          totalRevenue: data.totalRevenue,
          jobCount: data.jobCount,
          lastUpdated: data.lastUpdated,
        });
      }
    } catch (err) {
      console.error("Failed to sync revenue:", err);
    } finally {
      setSyncing(false);
    }
  }, []);

  const formatLastUpdated = (iso: string | null) => {
    if (!iso) return "Never";
    const date = new Date(iso);
    const now = new Date();
    const mins = Math.round((now.getTime() - date.getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* On-Chain Revenue Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        {/* Mobile: Stacked layout */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg flex-shrink-0">
              <LinkIcon className="w-5 h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <div className="text-sm text-gray-500">On-Chain Revenue</div>
              <div className="text-2xl font-bold text-gray-900">
                ${revenue?.totalRevenue?.toFixed(2) || "0.00"}
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({revenue?.jobCount || 0} jobs)
                </span>
              </div>
            </div>
          </div>
          
          {/* Mobile: Full-width button stack */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <span className="text-xs text-gray-400 text-center sm:text-left">
              {formatLastUpdated(revenue?.lastUpdated || null)}
            </span>
            <button
              onClick={syncRevenue}
              disabled={syncing}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 min-h-[44px] sm:min-h-0"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              Sync Revenue
            </button>
          </div>
        </div>
      </div>

      {/* Wallet Balance - loads automatically (server-side auth) */}
      <WalletBalanceCard key={`wallet-${refreshKey}`} />

      {/* Offerings Table */}
      <AcpOfferingsTable
        offerings={offerings}
        onRefresh={refreshOfferings}
      />

      {/* Recent Jobs - loads automatically (server-side auth) */}
      <RecentJobsTable limit={15} key={`jobs-${refreshKey}`} />
    </div>
  );
}
