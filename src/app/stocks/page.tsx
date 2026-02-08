import type { Metadata } from "next";
import { Suspense } from "react";
import db, { ensureDB } from "@/lib/db";
import { StockReport } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { StocksPageContent } from "./StocksPageContent";

export const metadata: Metadata = {
  title: "Stocks",
};

// Cache Research tab data for 60 seconds
// Watchlist/Portfolio tabs fetch client-side for real-time data
export const revalidate = 60;

type ResearchJob = {
  id: string;
  ticker: string;
  status: "pending" | "processing" | "complete" | "failed";
  progress: number;
  error_message: string | null;
  report_id: number | null;
  created_at: string;
  updated_at: string;
};

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

export default async function StocksPage() {
  await ensureDB();
  const [reports, activeJobs] = await Promise.all([
    getReports(),
    getActiveJobs(),
  ]);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Suspense fallback={<div>Loading...</div>}>
          <StocksPageContent
            reports={reports}
            activeJobs={activeJobs}
          />
        </Suspense>
      </main>
    </div>
  );
}
