import { Project } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/lib/date";
import Link from "next/link";
import { Lightbulb, Search, Hammer, Rocket, TrendingUp, RefreshCw, Shield, FlaskConical, Package, Globe } from "lucide-react";

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

const phaseIcons: Record<string, React.ReactNode> = {
  idea: <Lightbulb className="w-3.5 h-3.5" />,
  research: <Search className="w-3.5 h-3.5" />,
  build: <Hammer className="w-3.5 h-3.5" />,
  launch: <Rocket className="w-3.5 h-3.5" />,
  grow: <TrendingUp className="w-3.5 h-3.5" />,
  iterate: <RefreshCw className="w-3.5 h-3.5" />,
  maintain: <Shield className="w-3.5 h-3.5" />,
};

const buildColors: Record<string, string> = {
  pass: "text-emerald-600",
  fail: "text-red-600",
  unknown: "text-gray-400",
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
      <EmptyState
        icon={<Rocket className="w-8 h-8" />}
        title="No projects yet"
        description="They'll appear here once Claudius creates them."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => {
        const phase = project.phase || "build";
        return (
          <Link key={project.id} href={`/projects/${project.id}`} className="card-hover group">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-gray-900 group-hover:text-emerald-600 transition-colors truncate">
                {project.name}
              </h3>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <span className={`status-badge ${phaseColors[phase]} inline-flex items-center gap-1`}>
                  {phaseIcons[phase]} {phase}
                </span>
                <span className={`status-badge ${statusColors[project.status] || statusColors.backlog}`}>
                  {statusLabels[project.status] || project.status}
                </span>
              </div>
            </div>

            {project.description && (
              <p className="text-sm text-gray-500 mb-3 line-clamp-2">{project.description}</p>
            )}

            <div className="flex items-center gap-4 text-xs text-gray-400 mt-auto">
              {project.build_status !== "unknown" && (
                <span className={`flex items-center gap-1 ${buildColors[project.build_status]}`}>
                  {project.build_status === "pass" ? "✓" : "✗"} Build
                </span>
              )}
              {project.test_count > 0 && (
                <span className="inline-flex items-center gap-1"><FlaskConical className="w-3 h-3" /> {project.test_count} tests</span>
              )}
              {project.last_deploy_time && (
                <span className="inline-flex items-center gap-1"><Rocket className="w-3 h-3" /> {formatDate(project.last_deploy_time)}</span>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              {project.repo_url && (
                <span className="text-xs text-gray-400 inline-flex items-center gap-1"><Package className="w-3 h-3" /> Repo</span>
              )}
              {project.deploy_url && (
                <span className="text-xs text-gray-400 inline-flex items-center gap-1"><Globe className="w-3 h-3" /> Live</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
