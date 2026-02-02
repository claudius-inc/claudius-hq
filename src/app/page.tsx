import db, { ensureDB } from "@/lib/db";
import { Project, Task, Activity, Cron, Comment } from "@/lib/types";
import { ProjectCards } from "@/components/ProjectCards";
import { ActivityFeed } from "@/components/ActivityFeed";
import { BlockersPanel } from "@/components/BlockersPanel";
import { CronsPanel } from "@/components/CronsPanel";
import { WhatsNext } from "@/components/WhatsNext";
import { UnreadComments } from "@/components/UnreadComments";
import { Nav } from "@/components/Nav";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { HealthStatus } from "@/components/HealthStatus";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getData() {
  await ensureDB();
  try {
    const [projectsRes, tasksRes, activityRes, cronsRes, blockersRes] = await Promise.all([
      db.execute("SELECT * FROM projects ORDER BY updated_at DESC"),
      db.execute("SELECT COUNT(*) as count, status FROM tasks GROUP BY status"),
      db.execute("SELECT a.*, p.name as project_name FROM activity a LEFT JOIN projects p ON a.project_id = p.id ORDER BY a.created_at DESC LIMIT 15"),
      db.execute("SELECT * FROM crons ORDER BY next_run ASC LIMIT 10"),
      db.execute("SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.status = 'blocked' ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END"),
    ]);

    const projects = projectsRes.rows as unknown as Project[];

    // Fetch 30-day activity for heatmap
    let heatmapActivity: Activity[] = [];
    try {
      const heatRes = await db.execute(
        "SELECT a.*, p.name as project_name FROM activity a LEFT JOIN projects p ON a.project_id = p.id WHERE a.created_at >= datetime('now', '-30 days') ORDER BY a.created_at DESC"
      );
      heatmapActivity = heatRes.rows as unknown as Activity[];
    } catch {
      // activity table may not exist
    }

    // Fetch latest health checks
    let healthChecks: { project_id: number; project_name: string; url: string; status_code: number; response_time_ms: number; ok: boolean }[] = [];
    try {
      const healthRes = await db.execute(`
        SELECT hc.*, p.name as project_name
        FROM health_checks hc
        JOIN projects p ON hc.project_id = p.id
        WHERE hc.id IN (
          SELECT MAX(id) FROM health_checks GROUP BY project_id
        )
        ORDER BY hc.checked_at DESC
      `);
      healthChecks = (healthRes.rows as unknown as { project_id: number; project_name: string; url: string; status_code: number; response_time_ms: number }[]).map((r) => ({
        ...r,
        ok: r.status_code >= 200 && r.status_code < 400,
      }));
    } catch {
      // health_checks table may not exist
    }

    // Query checklist progress for launch-phase projects
    let checklistProgress: Record<number, { total: number; completed: number; nextItem: string | null }> = {};
    try {
      const launchProjects = projects.filter((p) => p.phase === "launch");
      for (const lp of launchProjects) {
        const res = await db.execute({
          sql: `SELECT pc.title, pc.item_order, COALESCE(pcp.completed, 0) as completed
                FROM phase_checklists pc
                LEFT JOIN project_checklist_progress pcp ON pc.id = pcp.checklist_item_id AND pcp.project_id = ?
                WHERE pc.phase = 'launch' AND pc.is_template = 1
                ORDER BY pc.item_order`,
          args: [lp.id],
        });
        const items = res.rows as unknown as { title: string; item_order: number; completed: number }[];
        const total = items.length;
        const completed = items.filter((i) => Number(i.completed) === 1).length;
        const next = items.find((i) => Number(i.completed) !== 1);
        checklistProgress[lp.id] = {
          total,
          completed,
          nextItem: next ? next.title : null,
        };
      }
    } catch {
      // Checklist tables may not exist yet
    }

    // Query blocked tasks with reasons (for WhatsNext)
    let blockedWithReasons: { project_id: number; blocker_reason: string }[] = [];
    try {
      const blockedRes = await db.execute(
        "SELECT project_id, blocker_reason FROM tasks WHERE status = 'blocked'"
      );
      blockedWithReasons = blockedRes.rows as unknown as { project_id: number; blocker_reason: string }[];
    } catch {
      // Tasks table may not exist
    }

    // Query unread comments
    let unreadComments: Comment[] = [];
    let unreadCount = 0;
    try {
      const countRes = await db.execute("SELECT COUNT(*) as count FROM comments WHERE is_read = 0");
      unreadCount = Number((countRes.rows[0] as unknown as { count: number }).count);
      if (unreadCount > 0) {
        const commentsRes = await db.execute(
          "SELECT * FROM comments WHERE is_read = 0 ORDER BY created_at DESC LIMIT 5"
        );
        unreadComments = commentsRes.rows as unknown as Comment[];
      }
    } catch {
      // Comments table may not exist
    }

    return {
      projects,
      taskStats: tasksRes.rows as unknown as { count: number; status: string }[],
      activity: activityRes.rows as unknown as Activity[],
      crons: cronsRes.rows as unknown as Cron[],
      blockers: blockersRes.rows as unknown as Task[],
      checklistProgress,
      blockedWithReasons,
      unreadComments,
      unreadCount,
      heatmapActivity,
      healthChecks,
    };
  } catch {
    return {
      projects: [],
      taskStats: [],
      activity: [],
      crons: [],
      blockers: [],
      checklistProgress: {},
      blockedWithReasons: [],
      unreadComments: [],
      unreadCount: 0,
      heatmapActivity: [],
      healthChecks: [],
    };
  }
}

export default async function Dashboard() {
  const {
    projects,
    taskStats,
    activity,
    crons,
    blockers,
    checklistProgress,
    blockedWithReasons,
    unreadComments,
    unreadCount,
    heatmapActivity,
    healthChecks,
  } = await getData();

  const totalTasks = taskStats.reduce((sum, s) => sum + Number(s.count), 0);
  const doneTasks = Number(taskStats.find((s) => s.status === "done")?.count || 0);
  const inProgress = Number(taskStats.find((s) => s.status === "in_progress")?.count || 0);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* What's Next */}
        <WhatsNext
          projects={projects}
          checklistProgress={checklistProgress}
          blockedTasks={blockedWithReasons}
        />

        {/* Unread Comments */}
        <UnreadComments comments={unreadComments} count={unreadCount} />

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Projects</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{projects.length}</div>
          </div>
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">In Progress</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{inProgress}</div>
          </div>
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Blockers</div>
            <div className="text-2xl font-bold text-red-600 mt-1">{blockers.length}</div>
          </div>
          <div className="card">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Completed</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{doneTasks}/{totalTasks}</div>
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

        {/* Health Status */}
        {healthChecks.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">🏥 Service Health</h2>
              <Link href="/integrations" className="text-sm text-gray-400 hover:text-gray-700">
                View all →
              </Link>
            </div>
            <div className="card">
              <HealthStatus checks={healthChecks} />
            </div>
          </div>
        )}

        {/* Activity Heatmap */}
        {heatmapActivity.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">📅 Activity (30 days)</h2>
            <ActivityTimeline activity={heatmapActivity} projects={projects} />
          </div>
        )}

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
