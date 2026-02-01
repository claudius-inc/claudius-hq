import { Cron } from "@/lib/types";

const statusColors: Record<string, string> = {
  active: "text-emerald-600",
  paused: "text-gray-400",
  error: "text-red-600",
  running: "text-amber-600",
};

const statusIcons: Record<string, string> = {
  active: "●",
  paused: "○",
  error: "✗",
  running: "◉",
};

export function CronsPanel({ crons }: { crons: Cron[] }) {
  if (crons.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-400">
        No scheduled tasks configured.
      </div>
    );
  }

  return (
    <div className="card divide-y divide-gray-200/50">
      {crons.map((cron) => (
        <div key={cron.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs ${statusColors[cron.status]}`}>
              {statusIcons[cron.status]}
            </span>
            <span className="text-sm font-medium text-gray-800 truncate">{cron.name}</span>
          </div>
          <div className="text-xs text-gray-400 ml-4 space-y-0.5">
            <div className="font-mono">{cron.schedule}</div>
            {cron.last_run && (
              <div>Last: {new Date(cron.last_run + "Z").toLocaleString()}</div>
            )}
            {cron.next_run && (
              <div>Next: {new Date(cron.next_run + "Z").toLocaleString()}</div>
            )}
            {cron.last_error && (
              <div className="text-red-600">Error: {cron.last_error}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
