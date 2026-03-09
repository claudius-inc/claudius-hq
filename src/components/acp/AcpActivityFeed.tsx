"use client";

import {
  Activity,
  DollarSign,
  XCircle,
  ShoppingCart,
  Plus,
  Trash2,
  Heart,
  Wallet,
} from "lucide-react";
import Link from "next/link";

interface AcpActivityItem {
  id: number;
  type: string;
  offering?: string | null;
  amount?: number | null;
  counterparty?: string | null;
  createdAt?: string | null;
}

interface AcpActivityFeedProps {
  activities: AcpActivityItem[];
  maxItems?: number;
}

function ActivityIcon({ type }: { type: string }) {
  const className = "w-4 h-4";
  switch (type) {
    case "job_completed":
      return <DollarSign className={`${className} text-green-500`} />;
    case "job_failed":
      return <XCircle className={`${className} text-red-500`} />;
    case "buy":
      return <ShoppingCart className={`${className} text-blue-500`} />;
    case "offering_created":
      return <Plus className={`${className} text-purple-500`} />;
    case "offering_deleted":
      return <Trash2 className={`${className} text-orange-500`} />;
    case "heartbeat":
      return <Heart className={`${className} text-pink-400`} />;
    case "wallet_sync":
      return <Wallet className={`${className} text-yellow-500`} />;
    default:
      return <Activity className={`${className} text-gray-400`} />;
  }
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

export function AcpActivityFeed({
  activities,
  maxItems = 10,
}: AcpActivityFeedProps) {
  const displayActivities = activities.slice(0, maxItems);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Recent Activity</h3>
        </div>
        <Link
          href="/acp"
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          View All
        </Link>
      </div>

      {displayActivities.length === 0 ? (
        <div className="px-4 py-6 text-center text-gray-400 text-sm">
          No recent activity
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
          {displayActivities.map((activity) => (
            <div
              key={activity.id}
              className="px-4 py-2 flex items-center gap-3 hover:bg-gray-50"
            >
              <ActivityIcon type={activity.type} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 truncate">
                  {activity.type.replace(/_/g, " ")}
                  {activity.offering && (
                    <span className="text-gray-500 ml-1">{activity.offering}</span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                {activity.amount !== null && activity.amount !== undefined && (
                  <div
                    className={`text-xs font-mono ${
                      activity.amount >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {activity.amount >= 0 ? "+" : ""}${activity.amount.toFixed(2)}
                  </div>
                )}
                {activity.createdAt && (
                  <div className="text-xs text-gray-400">
                    {formatRelativeTime(activity.createdAt)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
