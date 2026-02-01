import db from "@/lib/db";
import { Project, Task, Activity, Cron } from "@/lib/types";
import { ProjectCards } from "@/components/ProjectCards";
import { ActivityFeed } from "@/components/ActivityFeed";
import { BlockersPanel } from "@/components/BlockersPanel";
import { CronsPanel } from "@/components/CronsPanel";
import { Nav } from "@/components/Nav";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getData() {
  try {
    const [projectsRes, tasksRes, activityRes, cronsRes, blockersRes] = await Promise.all([
      db.execute("SELECT * FROM projects ORDER BY updated_at DESC"),
      db.execute("SELECT COUNT(*) as count, status FROM tasks GROUP BY status"),
      db.execute("SELECT a.*, p.name as project_name FROM activity a LEFT JOIN projects p ON a.project_id = p.id ORDER BY a.created_at DESC LIMIT 15"),
      db.execute("SELECT * FROM crons ORDER BY next_run ASC LIMIT 10"),
      db.execute("SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.status = 'blocked' ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END"),
    ]);

    return {
      projects: projectsRes.rows as unknown as Project[],
      taskStats: tasksRes.rows as unknown as { count: number; status: string }[],
      activity: activityRes.rows as unknown as Activity[],
      crons: cronsRes.rows as unknown as Cron[],
      blockers: blockersRes.rows as unknown as Task[],
    };
  } catch {
    return { projects: [], taskStats: [], activity: [], crons: [], blockers: [] };
  }
}

export default async function Dashboard() {
  const { projects, taskStats, activity, crons, blockers } = await getData();

  const totalTasks = taskStats.reduce((sum, s) => sum + Number(s.count), 0);
  const doneTasks = Number(taskStats.find((s) => s.status === "done")?.count || 0);
  const inProgress = Number(taskStats.find((s) => s.status === "in_progress")?.count || 0);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Projects</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{projects.length}</div>
          </div>
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">In Progress</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">{inProgress}</div>
          </div>
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Blockers</div>
            <div className="text-2xl font-bold text-red-400 mt-1">{blockers.length}</div>
          </div>
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Completed</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{doneTasks}/{totalTasks}</div>
          </div>
        </div>

        {/* Blockers */}
        {blockers.length > 0 && (
          <div className="mb-6">
            <BlockersPanel blockers={blockers} />
          </div>
        )}

        {/* Projects */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Projects</h2>
            <Link href="/projects" className="text-sm text-gray-400 hover:text-gray-700">
              View all →
            </Link>
          </div>
          <ProjectCards projects={projects} />
        </div>

        {/* Activity + Crons */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Recent Activity</h2>
              <Link href="/activity" className="text-sm text-gray-400 hover:text-gray-700">
                View all →
              </Link>
            </div>
            <ActivityFeed activity={activity} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Scheduled Tasks</h2>
              <Link href="/crons" className="text-sm text-gray-400 hover:text-gray-700">
                View all →
              </Link>
            </div>
            <CronsPanel crons={crons} />
          </div>
        </div>
      </main>
    </div>
  );
}
