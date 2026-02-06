import db, { ensureDB } from "@/lib/db";
import { ResearchPage, Project } from "@/lib/types";
import { Nav } from "@/components/Nav";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ResearchIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/projects" className="hover:text-gray-700">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${id}`} className="hover:text-gray-700">{project.name}</Link>
          <span>/</span>
          <span className="text-gray-600">Research</span>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">🔬 {project.name} Research</h1>
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
                className="card card-hover p-4 flex items-center gap-4 group"
              >
                <span className="text-sm font-mono text-gray-300 w-6 text-right">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <h2 className="font-medium text-gray-900 group-hover:text-emerald-600 transition-colors truncate">
                    {page.title}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">/{page.slug}</p>
                </div>
                <span className="text-gray-300 group-hover:text-emerald-500 transition-colors">→</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
