import type { Metadata } from "next";
import db, { ensureDB } from "@/lib/db";
import { Project } from "@/lib/types";
import { ActionPlanCard } from "@/components/ActionPlanCard";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { id } = params;
  try {
    await ensureDB();
    const result = await db.execute({ sql: "SELECT name FROM projects WHERE id = ?", args: [Number(id)] });
    if (result.rows.length > 0) {
      const project = result.rows[0] as unknown as { name: string };
      return { title: `${project.name} - Action Plan` };
    }
  } catch {}
  return { title: "Action Plan" };
}

export default async function ActionPlanPage({ params }: { params: { id: string } }) {
  const { id } = params;
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
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4 flex-wrap">
        <Link href="/projects" className="hover:text-gray-700">Projects</Link>
        <span>/</span>
        <Link href={`/projects/${id}`} className="hover:text-gray-700">{project.name}</Link>
        <span>/</span>
        <span className="text-gray-700">Action Plan</span>
      </div>

      {project.action_plan ? (
        <ActionPlanCard
          phase={phase}
          actionPlan={project.action_plan}
          researchCount={researchCount}
          projectId={Number(id)}
          deployUrl={project.deploy_url}
        />
      ) : (
        <div className="card p-8 text-center text-gray-400">
          <p className="text-lg mb-2">No action plan yet</p>
          <p className="text-sm">Add an action plan via the API to track progress.</p>
        </div>
      )}
    </>
  );
}
