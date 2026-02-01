import { Activity } from "@/lib/types";

const typeIcons: Record<string, string> = {
  commit: "💻",
  deploy: "🚀",
  feature: "✨",
  fix: "🔧",
  status_change: "📋",
  general: "📌",
  build: "🏗️",
  test: "🧪",
  release: "📦",
};

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr + "Z");
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export function ActivityFeed({ activity }: { activity: Activity[] }) {
  if (activity.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-400">
        No activity yet. Events will appear here as Claudius works.
      </div>
    );
  }

  return (
    <div className="card divide-y divide-gray-200/50">
      {activity.map((event) => (
        <div key={event.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start gap-3">
            <span className="text-lg mt-0.5">{typeIcons[event.type] || "📌"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-800 truncate">{event.title}</span>
                {event.project_name && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">
                    {event.project_name}
                  </span>
                )}
              </div>
              {event.description && (
                <p className="text-xs text-gray-400 line-clamp-2">{event.description}</p>
              )}
            </div>
            <span className="text-xs text-gray-400 shrink-0">{timeAgo(event.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
