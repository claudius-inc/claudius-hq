import { Comment } from "@/lib/types";

interface UnreadCommentsProps {
  comments: Comment[];
  count: number;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr + "Z");
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function UnreadComments({ comments, count }: UnreadCommentsProps) {
  if (count === 0) return null;

  const latest = comments[0];

  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/60 to-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">💬</span>
        <h3 className="text-sm font-semibold text-gray-900">
          {count} unread comment{count !== 1 ? "s" : ""}
        </h3>
      </div>
      {latest && (
        <div className="rounded-lg bg-white/80 border border-blue-100 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-blue-700">{latest.author}</span>
            <span className="text-[10px] text-gray-400">
              on {latest.target_type} #{latest.target_id}
            </span>
            <span className="text-[10px] text-gray-300 ml-auto">{timeAgo(latest.created_at)}</span>
          </div>
          <p className="text-sm text-gray-600 line-clamp-2">{latest.text}</p>
        </div>
      )}
      {count > 1 && (
        <p className="text-xs text-gray-400 mt-2">
          + {count - 1} more unread
        </p>
      )}
    </div>
  );
}
