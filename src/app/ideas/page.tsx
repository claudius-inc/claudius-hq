import db, { ensureDB } from "@/lib/db";
import { Idea } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { IdeasPipeline } from "@/components/IdeasPipeline";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  await ensureDB();
  let ideas: Idea[] = [];
  try {
    const result = await db.execute("SELECT * FROM ideas ORDER BY created_at DESC");
    ideas = result.rows as unknown as Idea[];
  } catch { /* DB not initialized yet */ }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Ideas Pipeline</h1>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>{ideas.length} ideas</span>
          </div>
        </div>
        <IdeasPipeline ideas={ideas} />
      </main>
    </div>
  );
}
