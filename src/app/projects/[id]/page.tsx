import type { Metadata } from "next";
import db, { ensureDB } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/date";
import { Project } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical, Globe, Package, Target } from "lucide-react";

// Revalidate project detail every 60 seconds
export const revalidate = 60;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { id } = params;
  try {
    await ensureDB();
    const result = await db.execute({ sql: "SELECT name FROM projects WHERE id = ?", args: [Number(id)] });
    if (result.rows.length > 0) {
      const project = result.rows[0] as unknown as { name: string };
      return { title: project.name };
    }
  } catch {}
  return { title: "Project" };
}

const statusColors: Record<string, string> = {
  backlog: "bg-gray-200 text-gray-700",
  in_progress: "bg-amber-100 text-amber-700",
  blocked: "bg-red-100 text-red-700",
  done: "bg-emerald-100 text-emerald-700",
};

const buildColors: Record<string, string> = {
  pass: "text-emerald-600",
  fail: "text-red-600",
  unknown: "text-gray-400",
};

export default async function ProjectOverviewPage({ params }: { params: { id: string } }) {
  const { id } = params;
  await ensureDB();

  const projectRes = await db.execute({ sql: "SELECT * FROM projects WHERE id = ?", args: [Number(id)] });
  if (projectRes.rows.length === 0) notFound();
  const project = projectRes.rows[0] as unknown as Project;

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href="/projects" className="hover:text-gray-700">Projects</Link>
        <span>/</span>
        <span className="text-gray-700">{project.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <span className={`status-badge ${statusColors[project.status]}`}>
            {project.status.replace("_", " ")}
          </span>
        </div>
        {project.description && (
          <p className="text-gray-500">{project.description}</p>
        )}

        {/* Quick Info Cards */}
        <div className="flex flex-wrap gap-3 mt-4">
          {project.build_status !== "unknown" && (
            <div className="card flex items-center gap-2 px-3 py-2">
              <span className={buildColors[project.build_status]}>
                {project.build_status === "pass" ? "✓" : "✗"}
              </span>
              <span className="text-sm text-gray-700">Build {project.build_status}</span>
            </div>
          )}
          {project.test_count > 0 && (
            <div className="card flex items-center gap-2 px-3 py-2">
              <FlaskConical className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">{project.test_count} tests</span>
            </div>
          )}
          {project.deploy_url && (
            <a href={project.deploy_url} target="_blank" rel="noopener noreferrer" className="card-hover flex items-center gap-2 px-3 py-2">
              <Globe className="w-4 h-4 text-emerald-500" />
              <span className="text-sm text-emerald-600">Live</span>
            </a>
          )}
          {project.repo_url && (
            <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="card-hover flex items-center gap-2 px-3 py-2">
              <Package className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-500">Repo</span>
            </a>
          )}
        </div>
      </div>

      {/* Target Audience */}
      {project.target_audience && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Target className="w-5 h-5 text-gray-500" /> Target Audience
          </h2>
          <p className="text-gray-700 whitespace-pre-wrap">{project.target_audience}</p>
        </div>
      )}

      {/* Project Details Grid */}
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
              <dd className="text-sm text-gray-900 mt-1 capitalize">{project.phase}</dd>
            </div>
            {project.repo_url && (
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">Repository</dt>
                <dd className="text-sm mt-1">
                  <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline break-all">
                    {project.repo_url}
                  </a>
                </dd>
              </div>
            )}
            {project.deploy_url && (
              <div>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">Deployment</dt>
                <dd className="text-sm mt-1">
                  <a href={project.deploy_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline break-all">
                    {project.deploy_url}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-gray-400 uppercase tracking-wide">Created</dt>
              <dd className="text-sm text-gray-900 mt-1">{formatDate(project.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400 uppercase tracking-wide">Last Updated</dt>
              <dd className="text-sm text-gray-900 mt-1">{formatDate(project.updated_at)}</dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Build Status</h2>
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
                  <span className="font-medium text-gray-900">{formatDateTime(project.last_deploy_time)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">Connect a GitHub repository to track build status.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
