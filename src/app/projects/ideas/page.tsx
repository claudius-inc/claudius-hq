import type { Metadata } from "next";
import db, { ensureDB } from "@/lib/db";
import { Idea } from "@/lib/types";
import { IdeasPipeline } from "@/components/IdeasPipeline";
import { IdeaForm } from "@/components/IdeaForm";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Ideas",
};

export const revalidate = 60;

export default async function IdeasPage() {
  await ensureDB();
  let ideas: Idea[] = [];
  try {
    const result = await db.execute("SELECT * FROM ideas ORDER BY created_at DESC");
    ideas = result.rows as unknown as Idea[];
  } catch { /* DB not initialized yet */ }

  return (
    <>
      <PageHero title="Ideas Pipeline" subtitle={`${ideas.length} ideas`} />

      <div className="mb-8">
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-emerald-600 hover:text-emerald-700 list-none flex items-center gap-2">
            <span className="text-lg">+</span>
            <span>Add New Idea</span>
          </summary>
          <div className="mt-4 card">
            <IdeaForm />
          </div>
        </details>
      </div>

      <IdeasPipeline ideas={ideas} />
    </>
  );
}
