import type { Metadata } from "next";
import { Suspense } from "react";
import db, { ensureDB } from "@/lib/db";
import { StockReport } from "@/lib/types";
import { PageHero } from "@/components/PageHero";
import { ResearchForm } from "@/components/ResearchForm";
import { ResearchContent } from "@/components/ResearchContent";
import { Skeleton } from "@/components/Skeleton";
import type { ResearchJob } from "@/db/schema";

export const metadata: Metadata = {
  title: "Research | Stocks",
};

// On-demand revalidation via /api/stocks/reports
export const revalidate = false;

async function getReports(): Promise<StockReport[]> {
  try {
    const result = await db.execute("SELECT * FROM stock_reports ORDER BY created_at DESC");
    return result.rows as unknown as StockReport[];
  } catch {
    return [];
  }
}

async function getActiveJobs(): Promise<ResearchJob[]> {
  try {
    const result = await db.execute(
      "SELECT * FROM research_jobs WHERE status IN ('pending', 'processing') ORDER BY created_at DESC"
    );
    return result.rows as unknown as ResearchJob[];
  } catch {
    return [];
  }
}

export default async function ResearchPage() {
  await ensureDB();
  const [reports, activeJobs] = await Promise.all([
    getReports(),
    getActiveJobs(),
  ]);

  return (
    <>
      <PageHero
        title="Research"
        subtitle="Generate deep-dive reports on any ticker"
        actionSlot={
          <Suspense fallback={<Skeleton className="h-10 w-full sm:w-80" />}>
            <ResearchForm />
          </Suspense>
        }
      />

      {/* Jobs + Reports (client-managed state for live updates) */}
      <ResearchContent initialReports={reports} initialJobs={activeJobs} />
    </>
  );
}
