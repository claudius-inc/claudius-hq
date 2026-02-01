import { Cron } from "@/lib/types";

const statusColors: Record<string, string> = {
  active: "text-emerald-400",
  paused: "text-zinc-500",
  error: "text-red-400",
  running: "text-amber-400",
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
      <div className="card text-center py-8 text-zinc-500">
        No scheduled tasks configured.
      </div>
    );
  }

  return (
    <div className="card divide-y divide-zinc-800/50">
      {crons.map((cron) => (
        <div key={cron.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs ${statusColors[cron.status]}`}>
              {statusIcons[cron.status]}
            </span>
            <span className="text-sm font-medium text-zinc-200 truncate">{cron.name}</span>
          </div>
          <div className="text-xs text-zinc-500 ml-4 space-y-0.5">
            <div className="font-mono">{cron.schedule}</div>
            {cron.last_run && (
              <div>Last: {new Date(cron.last_run + "Z").toLocaleString()}</div>
            )}
            {cron.next_run && (
              <div>Next: {new Date(cron.next_run + "Z").toLocaleString()}</div>
            )}
            {cron.last_error && (
              <div className="text-red-400">Error: {cron.last_error}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
