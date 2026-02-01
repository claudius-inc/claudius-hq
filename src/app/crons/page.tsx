import db from "@/lib/db";
import { Cron } from "@/lib/types";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
  active: "bg-emerald-900/50 text-emerald-400",
  paused: "bg-gray-100 text-gray-500",
  error: "bg-red-900/50 text-red-400",
  running: "bg-amber-900/50 text-amber-400",
};

export default async function CronsPage() {
  let crons: Cron[] = [];
  try {
    const result = await db.execute("SELECT * FROM crons ORDER BY status ASC, next_run ASC");
    crons = result.rows as unknown as Cron[];
  } catch { /* DB not initialized yet */ }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Scheduled Tasks</h1>

        {crons.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            No scheduled tasks configured yet.
          </div>
        ) : (
          <div className="space-y-3">
            {crons.map((cron) => (
              <div key={cron.id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-gray-900">{cron.name}</h3>
                    <span className={`status-badge ${statusColors[cron.status]}`}>
                      {cron.status}
                    </span>
                  </div>
                  <code className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded font-mono">
                    {cron.schedule}
                  </code>
                </div>

                {cron.description && (
                  <p className="text-sm text-gray-500 mb-2">{cron.description}</p>
                )}

                <div className="flex gap-6 text-xs text-gray-400">
                  {cron.last_run && (
                    <div>
                      <span className="text-gray-400">Last run: </span>
                      {new Date(cron.last_run + "Z").toLocaleString()}
                    </div>
                  )}
                  {cron.next_run && (
                    <div>
                      <span className="text-gray-400">Next run: </span>
                      {new Date(cron.next_run + "Z").toLocaleString()}
                    </div>
                  )}
                </div>

                {cron.last_error && (
                  <div className="mt-2 text-xs text-red-400 bg-red-950/30 rounded px-2 py-1">
                    Error: {cron.last_error}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
