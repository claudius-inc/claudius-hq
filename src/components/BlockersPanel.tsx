import { Task } from "@/lib/types";

const priorityColors: Record<string, string> = {
  critical: "border-l-red-500 bg-red-50",
  high: "border-l-orange-500 bg-orange-50",
  medium: "border-l-amber-500 bg-amber-50",
  low: "border-l-gray-400 bg-gray-50",
};

export function BlockersPanel({ blockers }: { blockers: Task[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold text-red-600">🚨 Blockers</h2>
        <span className="bg-red-100 text-red-600 text-xs font-medium px-2 py-0.5 rounded-full">
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
                  <span className="text-xs font-medium uppercase text-red-500">{task.priority}</span>
                </div>
                {task.project_name && (
                  <span className="text-xs text-gray-500">{task.project_name}</span>
                )}
              </div>
            </div>
            {task.blocker_reason && (
              <p className="text-sm text-red-700 mt-2">
                ↳ {task.blocker_reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
