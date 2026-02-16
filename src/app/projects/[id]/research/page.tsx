import type { Metadata } from "next";
import db, { ensureDB } from "@/lib/db";
import { ResearchPage, Project } from "@/lib/types";
import Link from "next/link";
import { notFound } from "next/navigation";

// Revalidate research list every 5 minutes
export const revalidate = 300;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { id } = params;
  try {
    await ensureDB();
    const result = await db.execute({ sql: "SELECT name FROM projects WHERE id = ?", args: [Number(id)] });
    if (result.rows.length > 0) {
      const project = result.rows[0] as unknown as { name: string };
      return { title: `${project.name} Research` };
    }
  } catch {}
  return { title: "Research" };
}

export default async function ResearchIndexPage({ params }: { params: { id: string } }) {
  const { id } = params;
  await ensureDB();

  const projectRes = await db.execute({ sql: "SELECT * FROM projects WHERE id = ?", args: [Number(id)] });
  if (projectRes.rows.length === 0) notFound();
  const project = projectRes.rows[0] as unknown as Project;

  const pagesRes = await db.execute({
    sql: "SELECT id, project_id, slug, title, sort_order, created_at, updated_at FROM research_pages WHERE project_id = ? ORDER BY sort_order ASC",
    args: [Number(id)],
  });
  const pages = pagesRes.rows as unknown as ResearchPage[];

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href="/projects" className="hover:text-gray-700">Projects</Link>
        <span>/</span>
        <Link href={`/projects/${id}`} className="hover:text-gray-700">{project.name}</Link>
        <span>/</span>
        <span className="text-gray-700">Research</span>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Research</h1>
        <span className="text-sm text-gray-400">{pages.length} pages</span>
      </div>

      {pages.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <p className="text-lg mb-2">No research pages yet</p>
          <p className="text-sm">Use the seed script to import research content for this project.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {pages.map((page, idx) => (
            <Link
              key={page.slug}
              href={`/projects/${id}/research/${page.slug}`}
              className="card card-hover p-4 flex items-center gap-3 group overflow-hidden"
            >
              <span className="text-sm font-mono text-gray-300 w-5 shrink-0 text-right">{idx + 1}</span>
              <div className="flex-1 min-w-0 overflow-hidden">
                <h2 className="font-medium text-gray-900 group-hover:text-emerald-600 transition-colors truncate text-sm sm:text-base">
                  {page.title}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5 truncate">/{page.slug}</p>
              </div>
              <span className="text-gray-300 group-hover:text-emerald-500 transition-colors shrink-0">→</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
