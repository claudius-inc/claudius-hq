import type { Metadata } from "next";
import { rawClient as db } from "@/db";
import { Project } from "@/lib/types";
import { ProjectFilters } from "./_components/ProjectFilters";
import { EmptyState } from "@/components/EmptyState";
import { PageHero } from "@/components/PageHero";
import { Rocket } from "lucide-react";

export const metadata: Metadata = {
  title: "Projects",
};

// On-demand revalidation via /api/projects
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  let projects: Project[] = [];
  try {
    const result = await db.execute("SELECT * FROM projects ORDER BY updated_at DESC");
    projects = result.rows as unknown as Project[];
  } catch { /* DB not initialized yet */ }

  return (
    <>
      <PageHero title="All Projects" subtitle={`${projects.length} projects`} />
      {projects.length > 0 ? (
        <ProjectFilters projects={projects} />
      ) : (
        <EmptyState
          icon={<Rocket className="w-6 h-6" />}
          title="No projects yet"
          description="They'll appear here once Claudius creates them."
        />
      )}
    </>
  );
}
