import { Task } from "@/lib/types";

const priorityColors: Record<string, string> = {
  critical: "border-l-red-500 bg-red-950/30",
  high: "border-l-orange-500 bg-orange-950/20",
  medium: "border-l-amber-500 bg-amber-950/20",
  low: "border-l-zinc-500",
};

export function BlockersPanel({ blockers }: { blockers: Task[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold text-red-400">🚨 Blockers</h2>
        <span className="bg-red-900/50 text-red-400 text-xs font-medium px-2 py-0.5 rounded-full">
          {blockers.length}
        </span>
      </div>

      <div className="space-y-2">
        {blockers.map((task) => (
          <div
            key={task.id}
            className={`card border-l-4 ${priorityColors[task.priority] || ""}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">{task.title}</span>
                  <span className="text-xs text-gray-400 uppercase">{task.priority}</span>
                </div>
                {task.project_name && (
                  <span className="text-xs text-gray-400">{task.project_name}</span>
                )}
              </div>
            </div>
            {task.blocker_reason && (
              <p className="text-sm text-red-300/80 mt-2 pl-0 border-l-0">
                ↳ {task.blocker_reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
