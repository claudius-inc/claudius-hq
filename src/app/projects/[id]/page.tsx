import db, { ensureDB } from "@/lib/db";
import { Project } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { ActionPlanCard } from "@/components/ActionPlanCard";
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
  build: "bg-amber-100 text-amber-700",
  live: "bg-emerald-100 text-emerald-700",
};

const phaseEmojis: Record<string, string> = {
  build: "🔨",
  live: "🌐",
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

  // Get research page count
  const researchRes = await db.execute({
    sql: "SELECT COUNT(*) as count FROM research_pages WHERE project_id = ?",
    args: [Number(id)],
  });
  const researchCount = (researchRes.rows[0] as unknown as { count: number }).count;

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

        {/* Target Audience */}
        {project.target_audience && (
          <div className="card mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>🎯</span> Target Audience
            </h2>
            <p className="text-gray-700 whitespace-pre-wrap">{project.target_audience}</p>
          </div>
        )}

        {/* Action Plan with Progress Stepper */}
        {project.action_plan && (
          <ActionPlanCard
            phase={phase}
            actionPlan={project.action_plan}
            researchCount={researchCount}
            projectId={Number(id)}
            deployUrl={project.deploy_url}
          />
        )}

        {/* Project Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Project Details</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">Status</dt>
                <dd className="text-sm text-gray-900 mt-1">{project.status.replace("_", " ")}</dd>
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Build Status</h2>
              {project.repo_url ? (
                <a
                  href={project.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  View Repository
                </a>
              ) : (
                <span className="text-sm text-gray-400 italic">No repository connected</span>
              )}
            </div>
            
            {project.repo_url ? (
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
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">Connect a GitHub repository to track build status and tests.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
