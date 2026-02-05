import db, { ensureDB } from "@/lib/db";
import { WikiPage, Project } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { WikiSidebar } from "@/components/WikiSidebar";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";

export const dynamic = "force-dynamic";

export default async function WikiPageDetail({ params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params;
  await ensureDB();

  const projectRes = await db.execute({ sql: "SELECT * FROM projects WHERE id = ?", args: [Number(id)] });
  if (projectRes.rows.length === 0) notFound();
  const project = projectRes.rows[0] as unknown as Project;

  const pageRes = await db.execute({
    sql: "SELECT * FROM wiki_pages WHERE project_id = ? AND slug = ?",
    args: [Number(id), slug],
  });
  if (pageRes.rows.length === 0) notFound();
  const page = pageRes.rows[0] as unknown as WikiPage;

  // Get all pages for sidebar navigation
  const allPagesRes = await db.execute({
    sql: "SELECT slug, title FROM wiki_pages WHERE project_id = ? ORDER BY sort_order ASC",
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
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-400 mb-4 overflow-x-auto">
          <Link href="/projects" className="hover:text-gray-700 whitespace-nowrap">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${id}`} className="hover:text-gray-700 whitespace-nowrap">{project.name}</Link>
          <span>/</span>
          <Link href={`/projects/${id}/wiki`} className="hover:text-gray-700 whitespace-nowrap">Wiki</Link>
          <span>/</span>
          <span className="text-gray-600 truncate">{page.title}</span>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <aside className="lg:w-64 lg:flex-shrink-0">
            <div className="lg:sticky lg:top-20">
              <WikiSidebar projectId={project.id} pages={allPages} />
            </div>
          </aside>

          {/* Content */}
          <article className="flex-1 min-w-0 overflow-hidden">
            <div className="card p-4 sm:p-6 lg:p-8">
              <div
                className="prose prose-gray max-w-none break-words
                  prose-headings:text-gray-900 prose-headings:font-semibold
                  prose-h1:text-xl prose-h1:sm:text-2xl prose-h1:border-b prose-h1:border-gray-100 prose-h1:pb-3 prose-h1:mb-6
                  prose-h2:text-lg prose-h2:sm:text-xl prose-h2:mt-8 prose-h2:mb-3
                  prose-h3:text-base prose-h3:sm:text-lg prose-h3:mt-6
                  prose-p:text-gray-600 prose-p:leading-relaxed prose-p:text-sm prose-p:sm:text-base
                  prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline prose-a:break-all
                  prose-strong:text-gray-800
                  prose-blockquote:border-emerald-200 prose-blockquote:bg-emerald-50/50 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:text-gray-600
                  prose-code:text-emerald-700 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-gray-900 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:text-xs prose-pre:sm:text-sm
                  prose-li:text-gray-600 prose-li:text-sm prose-li:sm:text-base
                  prose-table:text-xs prose-table:sm:text-sm
                  prose-th:text-left prose-th:text-gray-700 prose-th:bg-gray-50 prose-th:px-2 prose-th:py-1.5 prose-th:sm:px-3 prose-th:sm:py-2
                  prose-td:text-gray-600 prose-td:px-2 prose-td:py-1.5 prose-td:sm:px-3 prose-td:sm:py-2
                  [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap [&_table]:sm:whitespace-normal [&_table]:sm:table
                  [&_pre]:max-w-[calc(100vw-4rem)] [&_pre]:sm:max-w-none"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            </div>

            {/* Prev/Next navigation */}
            <div className="flex items-center justify-between mt-6 gap-4">
              {prevPage ? (
                <Link
                  href={`/projects/${id}/wiki/${prevPage.slug}`}
                  className="card card-hover px-4 py-3 flex-1 group"
                >
                  <span className="text-xs text-gray-400">← Previous</span>
                  <p className="text-sm font-medium text-gray-700 group-hover:text-emerald-600 transition-colors truncate">
                    {prevPage.title}
                  </p>
                </Link>
              ) : (
                <div className="flex-1" />
              )}
              {nextPage ? (
                <Link
                  href={`/projects/${id}/wiki/${nextPage.slug}`}
                  className="card card-hover px-4 py-3 flex-1 text-right group"
                >
                  <span className="text-xs text-gray-400">Next →</span>
                  <p className="text-sm font-medium text-gray-700 group-hover:text-emerald-600 transition-colors truncate">
                    {nextPage.title}
                  </p>
                </Link>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}
