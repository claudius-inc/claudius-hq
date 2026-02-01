import db from "@/lib/db";
import { Project, Task, Activity, Comment, Metric } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { ActivityFeed } from "@/components/ActivityFeed";
import { KanbanBoard } from "@/components/KanbanBoard";
import { CommentSection } from "@/components/CommentSection";
import { PhaseChecklist } from "@/components/PhaseChecklist";
import { MetricsDisplay } from "@/components/MetricsDisplay";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
  backlog: "bg-gray-200 text-gray-700",
  in_progress: "bg-amber-100 text-amber-700",
  blocked: "bg-red-100 text-red-700",
  done: "bg-emerald-100 text-emerald-700",
};

const phaseColors: Record<string, string> = {
  idea: "bg-purple-100 text-purple-700",
  research: "bg-blue-100 text-blue-700",
  build: "bg-amber-100 text-amber-700",
  launch: "bg-emerald-100 text-emerald-700",
  grow: "bg-teal-100 text-teal-700",
  iterate: "bg-cyan-100 text-cyan-700",
  maintain: "bg-gray-200 text-gray-600",
};

const phaseEmojis: Record<string, string> = {
  idea: "💡",
  research: "🔍",
  build: "🔨",
  launch: "🚀",
  grow: "📈",
  iterate: "🔄",
  maintain: "🛡️",
};

const buildColors: Record<string, string> = {
  pass: "text-emerald-600",
  fail: "text-red-600",
  unknown: "text-gray-400",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const projectRes = await db.execute({ sql: "SELECT * FROM projects WHERE id = ?", args: [Number(id)] });
  if (projectRes.rows.length === 0) notFound();
  const project = projectRes.rows[0] as unknown as Project;

  const [tasksRes, activityRes, commentsRes, metricsRes, checklistRes] = await Promise.all([
    db.execute({ sql: "SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.project_id = ? ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END", args: [Number(id)] }),
    db.execute({ sql: "SELECT a.*, p.name as project_name FROM activity a LEFT JOIN projects p ON a.project_id = p.id WHERE a.project_id = ? ORDER BY a.created_at DESC LIMIT 20", args: [Number(id)] }),
    db.execute({ sql: "SELECT * FROM comments WHERE target_type = 'project' AND target_id = ? ORDER BY created_at DESC", args: [Number(id)] }),
    db.execute({ sql: "SELECT m.*, p.name as project_name FROM metrics m LEFT JOIN projects p ON m.project_id = p.id WHERE m.project_id = ? ORDER BY m.recorded_at DESC", args: [Number(id)] }),
    db.execute({
      sql: `SELECT pc.*, pcp.completed, pcp.completed_at, pcp.notes, pcp.id as progress_id
            FROM phase_checklists pc
            LEFT JOIN project_checklist_progress pcp ON pc.id = pcp.checklist_item_id AND pcp.project_id = ?
            WHERE pc.phase = ? AND pc.is_template = 1
            ORDER BY pc.item_order`,
      args: [Number(id), project.phase || "build"],
    }),
  ]);

  const tasks = tasksRes.rows as unknown as Task[];
  const activity = activityRes.rows as unknown as Activity[];
  const comments = commentsRes.rows as unknown as Comment[];
  const metrics = metricsRes.rows as unknown as Metric[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checklistItems = checklistRes.rows as any[];

  const phase = project.phase || "build";

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Link href="/projects" className="hover:text-gray-700">Projects</Link>
            <span>/</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <span className={`status-badge ${statusColors[project.status]}`}>
              {project.status.replace("_", " ")}
            </span>
            <span className={`status-badge ${phaseColors[phase]}`}>
              {phaseEmojis[phase]} {phase}
            </span>
          </div>
          {project.description && (
            <p className="text-gray-500 mt-2">{project.description}</p>
          )}

          {/* Health Card */}
          <div className="flex flex-wrap gap-4 mt-4">
            {project.build_status !== "unknown" && (
              <div className="card flex items-center gap-2 px-3 py-2">
                <span className={buildColors[project.build_status]}>
                  {project.build_status === "pass" ? "✓" : "✗"}
                </span>
                <span className="text-sm text-gray-700">
                  Build {project.build_status}
                </span>
              </div>
            )}
            {project.test_count > 0 && (
              <div className="card flex items-center gap-2 px-3 py-2">
                <span className="text-sm">🧪</span>
                <span className="text-sm text-gray-700">{project.test_count} tests</span>
              </div>
            )}
            {project.deploy_url && (
              <a href={project.deploy_url} target="_blank" rel="noopener noreferrer" className="card-hover flex items-center gap-2 px-3 py-2">
                <span className="text-sm">🌐</span>
                <span className="text-sm text-emerald-600">Live</span>
              </a>
            )}
            {project.repo_url && (
              <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="card-hover flex items-center gap-2 px-3 py-2">
                <span className="text-sm">📦</span>
                <span className="text-sm text-gray-500">Repo</span>
              </a>
            )}
            {project.last_deploy_time && (
              <div className="card flex items-center gap-2 px-3 py-2">
                <span className="text-sm">🚀</span>
                <span className="text-sm text-gray-500">
                  Deployed {new Date(project.last_deploy_time).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Phase Progress + Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">
              {phaseEmojis[phase]} {phase.charAt(0).toUpperCase() + phase.slice(1)} Checklist
            </h2>
            <div className="card">
              <PhaseChecklist items={checklistItems} projectId={project.id} phase={phase} />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">📊 Metrics</h2>
            <MetricsDisplay metrics={metrics} />
          </div>
        </div>

        {/* Kanban Board */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Tasks</h2>
          <KanbanBoard tasks={tasks} />
        </div>

        {/* Activity + Comments */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Activity</h2>
            <ActivityFeed activity={activity} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Comments</h2>
            <CommentSection comments={comments} targetType="project" targetId={project.id} />
          </div>
        </div>
      </main>
    </div>
  );
}
