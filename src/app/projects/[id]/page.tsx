import db, { ensureDB } from "@/lib/db";
import { Project } from "@/lib/types";
import { Nav } from "@/components/Nav";
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
  await ensureDB();

  const projectRes = await db.execute({ sql: "SELECT * FROM projects WHERE id = ?", args: [Number(id)] });
  if (projectRes.rows.length === 0) notFound();
  const project = projectRes.rows[0] as unknown as Project;

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

          {/* Project Info Cards */}
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

        {/* Project Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Project Details</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">Status</dt>
                <dd className="text-sm text-gray-900 mt-1">{project.status.replace("_", " ")}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">Phase</dt>
                <dd className="text-sm text-gray-900 mt-1">{phaseEmojis[phase]} {phase}</dd>
              </div>
              {project.repo_url && (
                <div>
                  <dt className="text-xs text-gray-400 uppercase tracking-wide">Repository</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                      {project.repo_url}
                    </a>
                  </dd>
                </div>
              )}
              {project.deploy_url && (
                <div>
                  <dt className="text-xs text-gray-400 uppercase tracking-wide">Deployment</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    <a href={project.deploy_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                      {project.deploy_url}
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">Created</dt>
                <dd className="text-sm text-gray-900 mt-1">{new Date(project.created_at).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">Last Updated</dt>
                <dd className="text-sm text-gray-900 mt-1">{new Date(project.updated_at).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Build Status</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Build Status</span>
                <span className={`font-medium ${buildColors[project.build_status]}`}>
                  {project.build_status === "pass" ? "✓ Passing" : project.build_status === "fail" ? "✗ Failing" : "Unknown"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Test Count</span>
                <span className="font-medium text-gray-900">{project.test_count}</span>
              </div>
              {project.last_deploy_time && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Last Deploy</span>
                  <span className="font-medium text-gray-900">
                    {new Date(project.last_deploy_time).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
