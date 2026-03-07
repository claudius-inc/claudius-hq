import { db } from "@/db";
import { acpActivities, acpOfferings, acpWalletSnapshots, acpEpochStats } from "@/db/schema";
import { desc } from "drizzle-orm";
import { formatDate } from "@/lib/format-date";
import Link from "next/link";
import { DollarSign, XCircle, ShoppingCart, Plus, Trash2, Heart, Wallet } from "lucide-react";

export const revalidate = 60; // Revalidate every minute

async function getAcpData() {
  const [activities, offerings, walletSnapshots, epochStats] = await Promise.all([
    db.select().from(acpActivities).orderBy(desc(acpActivities.createdAt)).limit(50),
    db.select().from(acpOfferings).orderBy(desc(acpOfferings.jobCount)),
    db.select().from(acpWalletSnapshots).orderBy(desc(acpWalletSnapshots.snapshotAt)).limit(1),
    db.select().from(acpEpochStats).orderBy(desc(acpEpochStats.epochNumber)).limit(1),
  ]);

  return {
    activities,
    offerings,
    wallet: walletSnapshots[0] || null,
    epochStat: epochStats[0] || null,
  };
}

function ActivityIcon({ type }: { type: string }) {
  const size = "w-4 h-4";
  switch (type) {
    case "job_completed":
      return <DollarSign className={`${size} text-green-500`} />;
    case "job_failed":
      return <XCircle className={`${size} text-red-500`} />;
    case "buy":
      return <ShoppingCart className={`${size} text-blue-500`} />;
    case "offering_created":
      return <Plus className={`${size} text-purple-500`} />;
    case "offering_deleted":
      return <Trash2 className={`${size} text-orange-500`} />;
    case "heartbeat":
      return <Heart className={`${size} text-pink-400 fill-pink-400`} />;
    case "wallet_sync":
      return <Wallet className={`${size} text-yellow-500`} />;
    default:
      return <span className="text-gray-400">•</span>;
  }
}

export default async function AcpPage() {
  const { activities, offerings, wallet, epochStat } = await getAcpData();

  const totalRevenue = offerings.reduce((sum, o) => sum + (o.totalRevenue || 0), 0);
  const totalJobs = offerings.reduce((sum, o) => sum + (o.jobCount || 0), 0);
  const activeOfferings = offerings.filter((o) => o.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ACP Dashboard</h1>
          <p className="text-sm text-gray-500">
            Agent Commerce Protocol activity tracker
            {wallet?.snapshotAt && (
              <span className="ml-2 text-xs text-gray-400">
                • Last sync: {formatDate(wallet.snapshotAt, { style: "relative" })}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Wallet Balance</div>
          <div className="text-2xl font-bold text-gray-900">
            ${wallet ? ((wallet.usdcBalance || 0) + (wallet.cbbtcBalance || 0) * (wallet.cbbtcValueUsd || 0)).toFixed(2) : "—"}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Total Revenue</div>
          <div className="text-2xl font-bold text-green-600">
            ${totalRevenue.toFixed(2)}
          </div>
          <div className="text-xs text-gray-400">{totalJobs} jobs</div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Active Offerings</div>
          <div className="text-2xl font-bold text-gray-900">{activeOfferings}</div>
          <div className="text-xs text-gray-400">of {offerings.length} total</div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Activity Feed */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {activities.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400">
                No activities yet
              </div>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start gap-3">
                    <div className="text-lg">
                      <ActivityIcon type={activity.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-gray-900">
                          {activity.type.replace(/_/g, " ")}
                        </span>
                        {activity.amount !== null && (
                          <span
                            className={`text-sm font-mono ${
                              activity.amount >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {activity.amount >= 0 ? "+" : ""}${activity.amount.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {activity.offering && (
                        <div className="text-xs text-gray-500">{activity.offering}</div>
                      )}
                      {activity.counterparty && (
                        <div className="text-xs text-gray-400 truncate">
                          {activity.counterparty}
                        </div>
                      )}
                      {activity.details && (() => {
                        try {
                          const details = JSON.parse(activity.details);
                          return (
                            <div className="text-xs text-gray-500 mt-1">
                              {details.action && <span>{details.action}</span>}
                              {details.pillar && <span className="ml-1">• {details.pillar}</span>}
                              {details.result && <span className="ml-1">• {details.result}</span>}
                            </div>
                          );
                        } catch {
                          return <div className="text-xs text-gray-500 mt-1">{activity.details}</div>;
                        }
                      })()}
                      <div className="text-xs text-gray-400 mt-1">
                        {activity.createdAt ? formatDate(activity.createdAt, { style: "relative" }) : ""}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Offerings List */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Offerings</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {offerings.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400">
                No offerings synced yet
              </div>
            ) : (
              offerings.map((offering) => (
                <div key={offering.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm text-gray-900">
                        {offering.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {offering.category || "uncategorized"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono text-gray-900">
                        ${offering.price?.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {offering.jobCount} jobs
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Wallet Details */}
      {wallet && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Wallet Details</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-500">USDC</div>
              <div className="font-mono">{wallet.usdcBalance?.toFixed(4) || 0}</div>
            </div>
            <div>
              <div className="text-gray-500">ETH</div>
              <div className="font-mono">{wallet.ethBalance?.toFixed(6) || 0}</div>
            </div>
            <div>
              <div className="text-gray-500">cbBTC</div>
              <div className="font-mono">
                {wallet.cbbtcBalance?.toFixed(8) || 0}{" "}
                <span className="text-gray-400">(${((wallet.cbbtcBalance || 0) * (wallet.cbbtcValueUsd || 0)).toFixed(2)})</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-400 mt-2">
            Last sync: {wallet.snapshotAt ? formatDate(wallet.snapshotAt, { style: "relative" }) : "never"}
          </div>
        </div>
      )}
    </div>
  );
}
