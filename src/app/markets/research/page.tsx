import type { Metadata } from "next";
import { Suspense } from "react";
import db, { ensureDB } from "@/lib/db";
import { StockReport } from "@/lib/types";
import { ResearchForm } from "@/components/ResearchForm";
import { ResearchContent } from "@/components/ResearchContent";
import { Skeleton } from "@/components/Skeleton";
import type { ResearchJob } from "@/db/schema";

export const metadata: Metadata = {
  title: "Research | Stocks",
};

export const revalidate = 60;

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
      {/* Research Launcher */}
      <div className="mb-8">
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            Launch Research
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter a ticker, theme, or comparison to generate a report
          </p>
          <Suspense fallback={<Skeleton className="h-12 w-full" />}>
            <ResearchForm />
          </Suspense>
        </div>
      </div>

      {/* Jobs + Reports (client-managed state for live updates) */}
      <ResearchContent initialReports={reports} initialJobs={activeJobs} />
    </>
  );
}
