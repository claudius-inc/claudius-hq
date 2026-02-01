import db from "@/lib/db";
import { Project } from "@/lib/types";
import { ProjectCards } from "@/components/ProjectCards";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

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
        <ProjectCards projects={projects} />
      </main>
    </div>
  );
}
