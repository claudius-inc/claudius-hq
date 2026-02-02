import { Activity, Project } from "@/lib/types";

interface Props {
  activity: Activity[];
  projects: Project[];
}

export function ActivityTimeline({ activity, projects }: Props) {
  // Build a 30-day grid per project
  const now = new Date();
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  // Count activity per project per day
  const counts: Record<number, Record<string, number>> = {};
  let maxCount = 1;

  for (const a of activity) {
    if (!a.project_id) continue;
    const day = a.created_at.slice(0, 10);
    if (!counts[a.project_id]) counts[a.project_id] = {};
    counts[a.project_id][day] = (counts[a.project_id][day] || 0) + 1;
    maxCount = Math.max(maxCount, counts[a.project_id][day]);
  }

  // Only show projects with activity
  const activeProjects = projects.filter((p) => counts[p.id]);

  if (activeProjects.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-4">
        No activity data for heatmap
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Day labels */}
        <div className="flex items-center mb-2">
          <div className="w-28 shrink-0" />
          <div className="flex-1 flex gap-px">
            {days.map((day, i) => (
              <div key={day} className="flex-1 text-center">
                {i % 7 === 0 ? (
                  <span className="text-[9px] text-gray-400">
                    {new Date(day + "T00:00:00").toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Per-project rows */}
        {activeProjects.map((project) => (
          <div key={project.id} className="flex items-center mb-1">
            <div className="w-28 shrink-0 truncate text-xs text-gray-600 pr-2">
              {project.name}
            </div>
            <div className="flex-1 flex gap-px">
              {days.map((day) => {
                const count = counts[project.id]?.[day] || 0;
                const intensity =
                  count === 0 ? 0 : Math.min(Math.ceil((count / maxCount) * 4), 4);
                const colors = [
                  "bg-gray-100",
                  "bg-emerald-200",
                  "bg-emerald-300",
                  "bg-emerald-500",
                  "bg-emerald-700",
                ];
                return (
                  <div
                    key={day}
                    className={`flex-1 h-4 rounded-sm ${colors[intensity]} transition-colors`}
                    title={`${project.name}: ${count} activities on ${day}`}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center justify-end gap-1 mt-3 text-[10px] text-gray-400">
          <span>Less</span>
          <div className="w-3 h-3 rounded-sm bg-gray-100" />
          <div className="w-3 h-3 rounded-sm bg-emerald-200" />
          <div className="w-3 h-3 rounded-sm bg-emerald-300" />
          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          <div className="w-3 h-3 rounded-sm bg-emerald-700" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
