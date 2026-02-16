import type { Metadata } from "next";
import db, { ensureDB } from "@/lib/db";
import { Project } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { id } = params;
  try {
    await ensureDB();
    const result = await db.execute({ sql: "SELECT name FROM projects WHERE id = ?", args: [Number(id)] });
    if (result.rows.length > 0) {
      const project = result.rows[0] as unknown as { name: string };
      return { title: `${project.name} - Tech Plan` };
    }
  } catch {}
  return { title: "Tech Plan" };
}

export default async function TechPlanPage({ params }: { params: { id: string } }) {
  const { id } = params;
  await ensureDB();

  const projectRes = await db.execute({ sql: "SELECT * FROM projects WHERE id = ?", args: [Number(id)] });
  if (projectRes.rows.length === 0) notFound();
  const project = projectRes.rows[0] as unknown as Project;

  const htmlContent = project.plan_tech 
    ? marked(project.plan_tech, { async: false }) as string
    : null;

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4 flex-wrap">
        <Link href="/projects" className="hover:text-gray-700">Projects</Link>
        <span>/</span>
        <Link href={`/projects/${id}`} className="hover:text-gray-700">{project.name}</Link>
        <span>/</span>
        <span className="text-gray-700">Tech Plan</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Tech Stack Plan</h1>
      </div>

      {htmlContent ? (
        <article className="card p-6 lg:p-8">
          <div
            className="prose prose-gray max-w-none
              prose-headings:text-gray-900 prose-headings:font-semibold
              prose-h1:text-2xl prose-h1:border-b prose-h1:border-gray-100 prose-h1:pb-3 prose-h1:mb-6
              prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3
              prose-h3:text-lg prose-h3:mt-6
              prose-p:text-gray-600 prose-p:leading-relaxed
              prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline
              prose-strong:text-gray-800
              prose-code:text-emerald-700 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm
              prose-pre:bg-gray-900 prose-pre:rounded-lg
              prose-li:text-gray-600
              prose-table:text-sm"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </article>
      ) : (
        <div className="card p-8 text-center text-gray-400">
          <p className="text-lg mb-2">No tech plan yet</p>
          <p className="text-sm">Add a tech implementation plan via the API.</p>
        </div>
      )}
    </>
  );
}
