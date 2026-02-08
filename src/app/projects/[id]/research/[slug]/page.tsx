import type { Metadata } from "next";
import db, { ensureDB } from "@/lib/db";
import { ResearchPage, Project } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { ResearchSidebar } from "@/components/ResearchSidebar";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";

// Revalidate research pages every 5 minutes
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string; slug: string }> }): Promise<Metadata> {
  const { id, slug } = await params;
  try {
    await ensureDB();
    const result = await db.execute({
      sql: "SELECT title FROM research_pages WHERE project_id = ? AND slug = ?",
      args: [Number(id), slug]
    });
    if (result.rows.length > 0) {
      const page = result.rows[0] as unknown as { title: string };
      return { title: page.title };
    }
  } catch {}
  return { title: "Research" };
}

export default async function ResearchPageDetail({ params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params;
  await ensureDB();

  const projectRes = await db.execute({ sql: "SELECT * FROM projects WHERE id = ?", args: [Number(id)] });
  if (projectRes.rows.length === 0) notFound();
  const project = projectRes.rows[0] as unknown as Project;

  const pageRes = await db.execute({
    sql: "SELECT * FROM research_pages WHERE project_id = ? AND slug = ?",
    args: [Number(id), slug],
  });
  if (pageRes.rows.length === 0) notFound();
  const page = pageRes.rows[0] as unknown as ResearchPage;

  // Get all pages for sidebar navigation
  const allPagesRes = await db.execute({
    sql: "SELECT slug, title FROM research_pages WHERE project_id = ? ORDER BY sort_order ASC",
    args: [Number(id)],
  });
  const allPages = allPagesRes.rows as unknown as { slug: string; title: string }[];

  // Find prev/next pages
  const currentIdx = allPages.findIndex((p) => p.slug === slug);
  const prevPage = currentIdx > 0 ? allPages[currentIdx - 1] : null;
  const nextPage = currentIdx < allPages.length - 1 ? allPages[currentIdx + 1] : null;

  // Render markdown to HTML
  const htmlContent = marked(page.content, { async: false }) as string;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/projects" className="hover:text-gray-700">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${id}`} className="hover:text-gray-700">{project.name}</Link>
          <span>/</span>
          <Link href={`/projects/${id}/research`} className="hover:text-gray-700">Research</Link>
          <span>/</span>
          <span className="text-gray-600 truncate max-w-[200px]">{page.title}</span>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <aside className="lg:w-64 lg:flex-shrink-0">
            <div className="lg:sticky lg:top-20">
              <ResearchSidebar projectId={project.id} pages={allPages} />
            </div>
          </aside>

          {/* Content */}
          <article className="flex-1 min-w-0">
            <div className="card p-6 lg:p-8">
              <div
                className="prose prose-gray max-w-none
                  prose-headings:text-gray-900 prose-headings:font-semibold
                  prose-h1:text-2xl prose-h1:border-b prose-h1:border-gray-100 prose-h1:pb-3 prose-h1:mb-6
                  prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3
                  prose-h3:text-lg prose-h3:mt-6
                  prose-p:text-gray-600 prose-p:leading-relaxed
                  prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline
                  prose-strong:text-gray-800
                  prose-blockquote:border-emerald-200 prose-blockquote:bg-emerald-50/50 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:text-gray-600
                  prose-code:text-emerald-700 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-gray-900 prose-pre:rounded-lg
                  prose-li:text-gray-600
                  prose-table:text-sm prose-table:w-full prose-table:overflow-x-auto prose-table:block prose-table:max-w-full
                  prose-th:text-left prose-th:text-gray-700 prose-th:bg-gray-50 prose-th:whitespace-nowrap
                  prose-td:text-gray-600 prose-td:whitespace-nowrap"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            </div>

            {/* Prev/Next navigation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
              {prevPage ? (
                <Link
                  href={`/projects/${id}/research/${prevPage.slug}`}
                  className="card card-hover px-4 py-3 group overflow-hidden"
                >
                  <span className="text-xs text-gray-400">← Previous</span>
                  <p className="text-sm font-medium text-gray-700 group-hover:text-emerald-600 transition-colors truncate">
                    {prevPage.title}
                  </p>
                </Link>
              ) : (
                <div className="hidden sm:block" />
              )}
              {nextPage ? (
                <Link
                  href={`/projects/${id}/research/${nextPage.slug}`}
                  className="card card-hover px-4 py-3 text-right group overflow-hidden sm:col-start-2"
                >
                  <span className="text-xs text-gray-400">Next →</span>
                  <p className="text-sm font-medium text-gray-700 group-hover:text-emerald-600 transition-colors truncate">
                    {nextPage.title}
                  </p>
                </Link>
              ) : (
                <div className="hidden sm:block" />
              )}
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}
