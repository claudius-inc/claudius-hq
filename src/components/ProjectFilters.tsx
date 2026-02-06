"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Project } from "@/lib/types";

type Phase = "all" | "build" | "launch" | "grow" | "iterate" | "maintain";
type Status = "all" | "blocked" | "in_progress" | "backlog" | "done";
type SortBy = "recent" | "alphabetical";

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

const statusLabels: Record<string, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

interface ProjectFiltersProps {
  projects: Project[];
}

export function ProjectFilters({ projects }: ProjectFiltersProps) {
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState<Phase>("all");
  const [status, setStatus] = useState<Status>("all");
  const [sortBy, setSortBy] = useState<SortBy>("recent");

  const filteredProjects = useMemo(() => {
    let filtered = [...projects];

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    // Filter by phase
    if (phase !== "all") {
      filtered = filtered.filter((p) => p.phase === phase);
    }

    // Filter by status
    if (status !== "all") {
      filtered = filtered.filter((p) => p.status === status);
    }

    // Sort
    if (sortBy === "alphabetical") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      filtered.sort(
        (a, b) =>
          new Date(b.updated_at || 0).getTime() -
          new Date(a.updated_at || 0).getTime()
      );
    }

    return filtered;
  }, [projects, search, phase, status, sortBy]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none w-36"
        />

        {/* Phase */}
        <select
          value={phase}
          onChange={(e) => setPhase(e.target.value as Phase)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
        >
          <option value="all">All Phases</option>
          <option value="build">🔨 Build</option>
          <option value="launch">🚀 Launch</option>
          <option value="grow">📈 Grow</option>
          <option value="iterate">🔄 Iterate</option>
          <option value="maintain">🛡️ Maintain</option>
        </select>

        {/* Status */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
        >
          <option value="all">All Status</option>
          <option value="in_progress">In Progress</option>
          <option value="blocked">Blocked</option>
          <option value="backlog">Backlog</option>
          <option value="done">Done</option>
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
        >
          <option value="recent">Recent</option>
          <option value="alphabetical">A-Z</option>
        </select>

        {/* Results count */}
        <span className="text-xs text-gray-500 ml-auto">
          {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Project Cards */}
      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => {
            const projectPhase = project.phase || "build";
            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="card-hover group">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 group-hover:text-emerald-600 transition-colors truncate">
                    {project.name}
                  </h3>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className={`status-badge ${phaseColors[projectPhase]}`}>
                      {phaseEmojis[projectPhase]} {projectPhase}
                    </span>
                    <span className={`status-badge ${statusColors[project.status] || statusColors.backlog}`}>
                      {statusLabels[project.status] || project.status}
                    </span>
                  </div>
                </div>

                {project.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{project.description}</p>
                )}

                <div className="flex gap-2 mt-3">
                  {project.repo_url && (
                    <span className="text-xs text-gray-400">📦 Repo</span>
                  )}
                  {project.deploy_url && (
                    <span className="text-xs text-gray-400">🌐 Live</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No matching projects</h3>
          <p className="text-sm text-gray-500">
            Try adjusting your filters
          </p>
        </div>
      )}
    </div>
  );
}
