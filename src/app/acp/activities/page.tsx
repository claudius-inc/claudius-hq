import { db } from "@/db";
import { acpActivities } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Activity, DollarSign, XCircle, ShoppingCart, Plus, Trash2, Heart, Wallet } from "lucide-react";
import Link from "next/link";

export const revalidate = 60;

function ActivityIcon({ type }: { type: string }) {
  const className = "w-5 h-5";
  switch (type) {
    case "job_completed": return <DollarSign className={`${className} text-green-500`} />;
    case "job_failed": return <XCircle className={`${className} text-red-500`} />;
    case "buy": return <ShoppingCart className={`${className} text-blue-500`} />;
    case "offering_created": return <Plus className={`${className} text-purple-500`} />;
    case "offering_deleted": return <Trash2 className={`${className} text-orange-500`} />;
    case "heartbeat": return <Heart className={`${className} text-pink-400`} />;
    case "wallet_sync": return <Wallet className={`${className} text-yellow-500`} />;
    case "marketing": return <Activity className={`${className} text-indigo-500`} />;
    default: return <Activity className={`${className} text-gray-400`} />;
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString + 'Z');
  return date.toLocaleString('en-SG', { 
    month: 'short', day: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });
}

export default async function ActivitiesPage() {
  const activities = await db
    .select()
    .from(acpActivities)
    .orderBy(desc(acpActivities.createdAt))
    .limit(100);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
          <p className="text-gray-500 text-sm">All ACP operations and events</p>
        </div>
        <Link href="/acp" className="text-blue-600 hover:text-blue-800 text-sm">
          ← Back to Dashboard
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 divide-y">
        {activities.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No activities recorded</div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="p-4 flex items-start gap-4 hover:bg-gray-50">
              <ActivityIcon type={activity.type} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {activity.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-gray-400">
                    {activity.createdAt ? formatDate(activity.createdAt) : ""}
                  </span>
                </div>
                {activity.offering && (
                  <div className="text-sm text-gray-600">{activity.offering}</div>
                )}
                {activity.amount && (
                  <div className="text-sm text-green-600 font-medium">
                    ${activity.amount.toFixed(2)}
                  </div>
                )}
                {activity.details && (
                  <div className="text-xs text-gray-500 mt-1">
                    {typeof activity.details === 'string' 
                      ? activity.details.substring(0, 100) 
                      : JSON.stringify(activity.details).substring(0, 100)}
                  </div>
                )}
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${
                  activity.outcome === 'success' ? 'bg-green-100 text-green-700' :
                  activity.outcome === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {activity.outcome || 'unknown'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
