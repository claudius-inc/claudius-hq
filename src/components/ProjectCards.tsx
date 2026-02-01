import { Project } from "@/lib/types";
import Link from "next/link";

const statusColors: Record<string, string> = {
  backlog: "bg-zinc-700 text-zinc-300",
  in_progress: "bg-amber-900/50 text-amber-400",
  blocked: "bg-red-900/50 text-red-400",
  done: "bg-emerald-900/50 text-emerald-400",
};

const buildColors: Record<string, string> = {
  pass: "text-emerald-400",
  fail: "text-red-400",
  unknown: "text-zinc-500",
};

const statusLabels: Record<string, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

export function ProjectCards({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <div className="card text-center py-12 text-zinc-500">
        No projects yet. They&apos;ll appear here once Claudius creates them.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <Link key={project.id} href={`/projects/${project.id}`} className="card-hover group">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors truncate">
              {project.name}
            </h3>
            <span className={`status-badge ${statusColors[project.status] || statusColors.backlog}`}>
              {statusLabels[project.status] || project.status}
            </span>
          </div>

          {project.description && (
            <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{project.description}</p>
          )}

          <div className="flex items-center gap-4 text-xs text-zinc-500 mt-auto">
            {project.build_status !== "unknown" && (
              <span className={`flex items-center gap-1 ${buildColors[project.build_status]}`}>
                {project.build_status === "pass" ? "✓" : "✗"} Build
              </span>
            )}
            {project.test_count > 0 && (
              <span>🧪 {project.test_count} tests</span>
            )}
            {project.last_deploy_time && (
              <span>🚀 {new Date(project.last_deploy_time).toLocaleDateString()}</span>
            )}
          </div>

          <div className="flex gap-2 mt-3">
            {project.repo_url && (
              <span className="text-xs text-zinc-600">📦 Repo</span>
            )}
            {project.deploy_url && (
              <span className="text-xs text-zinc-600">🌐 Live</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
