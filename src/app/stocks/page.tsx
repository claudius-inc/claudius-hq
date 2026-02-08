import type { Metadata } from "next";
import { Suspense } from "react";
import db, { ensureDB } from "@/lib/db";
import { StockReport, WatchlistItem, PortfolioHolding, PortfolioReport } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { StocksPageContent } from "./StocksPageContent";

export const metadata: Metadata = {
  title: "Stocks",
};

export const dynamic = "force-dynamic";

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

async function getWatchlistItems(): Promise<WatchlistItem[]> {
  try {
    const result = await db.execute("SELECT * FROM watchlist ORDER BY added_at DESC");
    return result.rows as unknown as WatchlistItem[];
  } catch {
    return [];
  }
}

async function getPortfolioHoldings(): Promise<PortfolioHolding[]> {
  try {
    const result = await db.execute(
      "SELECT * FROM portfolio_holdings ORDER BY target_allocation DESC"
    );
    return result.rows as unknown as PortfolioHolding[];
  } catch {
    return [];
  }
}

async function getPortfolioReports(): Promise<PortfolioReport[]> {
  try {
    const result = await db.execute(
      "SELECT * FROM portfolio_reports ORDER BY created_at DESC"
    );
    return result.rows as unknown as PortfolioReport[];
  } catch {
    return [];
  }
}

export default async function StocksPage() {
  await ensureDB();
  const [reports, activeJobs, watchlistItems, portfolioHoldings, portfolioReports] =
    await Promise.all([
      getReports(),
      getActiveJobs(),
      getWatchlistItems(),
      getPortfolioHoldings(),
      getPortfolioReports(),
    ]);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Suspense fallback={<div>Loading...</div>}>
          <StocksPageContent
            reports={reports}
            activeJobs={activeJobs}
            watchlistItems={watchlistItems}
            portfolioHoldings={portfolioHoldings}
            portfolioReports={portfolioReports}
          />
        </Suspense>
      </main>
    </div>
  );
}
