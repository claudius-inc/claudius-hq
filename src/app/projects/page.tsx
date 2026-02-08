import type { Metadata } from "next";
import db from "@/lib/db";
import { Project } from "@/lib/types";
import { ProjectFilters } from "@/components/ProjectFilters";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Projects",
};

// Revalidate project list every 60 seconds
export const revalidate = 60;

export default async function ProjectsPage() {
  let projects: Project[] = [];
  try {
    const result = await db.execute("SELECT * FROM projects ORDER BY updated_at DESC");
    projects = result.rows as unknown as Project[];
  } catch { /* DB not initialized yet */ }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">All Projects</h1>
        {projects.length > 0 ? (
          <ProjectFilters projects={projects} />
        ) : (
          <div className="card text-center py-12 text-gray-400">
            No projects yet. They&apos;ll appear here once Claudius creates them.
          </div>
        )}
      </main>
    </div>
  );
}
