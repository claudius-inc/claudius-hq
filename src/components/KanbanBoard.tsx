import { Task } from "@/lib/types";

const columns = [
  { key: "backlog", label: "Backlog", color: "border-zinc-700" },
  { key: "in_progress", label: "In Progress", color: "border-amber-600" },
  { key: "blocked", label: "Blocked", color: "border-red-600" },
  { key: "done", label: "Done", color: "border-emerald-600" },
];

const priorityBadges: Record<string, string> = {
  critical: "bg-red-900/50 text-red-400",
  high: "bg-orange-900/50 text-orange-400",
  medium: "bg-amber-900/50 text-amber-400",
  low: "bg-zinc-800 text-zinc-400",
};

export function KanbanBoard({ tasks }: { tasks: Task[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.key);
        return (
          <div key={col.key} className={`border-t-2 ${col.color} rounded-lg`}>
            <div className="flex items-center justify-between px-3 py-2">
              <h3 className="text-sm font-medium text-zinc-400">{col.label}</h3>
              <span className="text-xs text-zinc-600">{colTasks.length}</span>
            </div>
            <div className="space-y-2 px-2 pb-2 min-h-[100px]">
              {colTasks.map((task) => (
                <div key={task.id} className="bg-zinc-900 border border-zinc-800 rounded-md p-3 hover:border-zinc-700 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200 leading-tight">{task.title}</span>
                    <span className={`status-badge text-[10px] shrink-0 ${priorityBadges[task.priority]}`}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-zinc-500 line-clamp-2 mb-1">{task.description}</p>
                  )}
                  {task.category && (
                    <span className="text-[10px] text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded">
                      {task.category}
                    </span>
                  )}
                  {task.blocker_reason && task.status === "blocked" && (
                    <p className="text-xs text-red-400/80 mt-1.5">↳ {task.blocker_reason}</p>
                  )}
                </div>
              ))}
              {colTasks.length === 0 && (
                <div className="text-center py-6 text-xs text-zinc-700">Empty</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
