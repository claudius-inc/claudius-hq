import { Nav } from "@/components/Nav";
import { ProjectSidebar, ProjectMobileTOC } from "@/components/ProjectSidebar";
import db, { ensureDB } from "@/lib/db";
import { Project } from "@/lib/types";
import { notFound } from "next/navigation";

interface ResearchPage {
  id: number;
  slug: string;
  title: string;
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const { id } = params;
  await ensureDB();

  // Fetch project
  const projectRes = await db.execute({
    sql: "SELECT * FROM projects WHERE id = ?",
    args: [Number(id)],
  });
  if (projectRes.rows.length === 0) notFound();
  const project = projectRes.rows[0] as unknown as Project;

  // Fetch research pages
  const researchRes = await db.execute({
    sql: "SELECT id, slug, title FROM research_pages WHERE project_id = ? ORDER BY sort_order, id",
    args: [Number(id)],
  });
  const researchPages = researchRes.rows as unknown as ResearchPage[];

  const hasPlanTech = Boolean(project.plan_tech);
  const hasPlanDistribution = Boolean(project.plan_distribution);

  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-8">
          {/* Desktop Sidebar */}
          <ProjectSidebar
            projectId={project.id}
            projectName={project.name}
            researchPages={researchPages}
            hasPlanTech={hasPlanTech}
            hasPlanDistribution={hasPlanDistribution}
          />

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile TOC */}
      <ProjectMobileTOC
        projectId={project.id}
        projectName={project.name}
        researchPages={researchPages}
        hasPlanTech={hasPlanTech}
        hasPlanDistribution={hasPlanDistribution}
      />
    </div>
  );
}
