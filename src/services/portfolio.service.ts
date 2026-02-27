/**
 * Portfolio Service
 * Handles portfolio holdings, reports, and analysis
 */
import { db, portfolioHoldings, portfolioReports, watchlist } from "@/db";
import { eq, desc } from "drizzle-orm";
import type { PortfolioHolding, PortfolioReport } from "@/db/schema";

// ============================================================================
// Portfolio Holdings
// ============================================================================

export async function listHoldings(): Promise<PortfolioHolding[]> {
  return db
    .select()
    .from(portfolioHoldings)
    .orderBy(desc(portfolioHoldings.targetAllocation));
}

export async function getHolding(id: number): Promise<PortfolioHolding | null> {
  const [holding] = await db
    .select()
    .from(portfolioHoldings)
    .where(eq(portfolioHoldings.id, id));
  return holding || null;
}

export async function getHoldingByTicker(ticker: string): Promise<PortfolioHolding | null> {
  const [holding] = await db
    .select()
    .from(portfolioHoldings)
    .where(eq(portfolioHoldings.ticker, ticker.toUpperCase()));
  return holding || null;
}

export interface CreateHoldingInput {
  ticker: string;
  targetAllocation: number;
  costBasis?: number | null;
  shares?: number | null;
}

export interface CreateHoldingResult {
  holding: PortfolioHolding | null;
  error?: "already_exists";
}

export async function createHolding(
  input: CreateHoldingInput
): Promise<CreateHoldingResult> {
  const upperTicker = input.ticker.toUpperCase().trim();

  // Check if already exists
  const existing = await getHoldingByTicker(upperTicker);
  if (existing) {
    return { holding: null, error: "already_exists" };
  }

  const [newHolding] = await db
    .insert(portfolioHoldings)
    .values({
      ticker: upperTicker,
      targetAllocation: input.targetAllocation,
      costBasis: input.costBasis ?? null,
      shares: input.shares ?? null,
    })
    .returning();

  // Also mark the stock as graduated in watchlist if it exists
  await db
    .update(watchlist)
    .set({
      status: "graduated",
      updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    })
    .where(eq(watchlist.ticker, upperTicker));

  return { holding: newHolding };
}

export interface UpdateHoldingInput {
  targetAllocation?: number;
  costBasis?: number | null;
  shares?: number | null;
}

export async function updateHolding(
  id: number,
  input: UpdateHoldingInput
): Promise<boolean> {
  const updateData: Partial<typeof portfolioHoldings.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.targetAllocation !== undefined) {
    updateData.targetAllocation = input.targetAllocation;
  }
  if (input.costBasis !== undefined) {
    updateData.costBasis = input.costBasis;
  }
  if (input.shares !== undefined) {
    updateData.shares = input.shares;
  }

  await db.update(portfolioHoldings).set(updateData).where(eq(portfolioHoldings.id, id));
  return true;
}

export async function deleteHolding(id: number): Promise<boolean> {
  const [existing] = await db
    .select({ id: portfolioHoldings.id })
    .from(portfolioHoldings)
    .where(eq(portfolioHoldings.id, id));

  if (!existing) {
    return false;
  }

  await db.delete(portfolioHoldings).where(eq(portfolioHoldings.id, id));
  return true;
}

export async function deleteHoldingByTicker(ticker: string): Promise<boolean> {
  const holding = await getHoldingByTicker(ticker);
  if (!holding) {
    return false;
  }

  await db.delete(portfolioHoldings).where(eq(portfolioHoldings.id, holding.id));
  return true;
}

// ============================================================================
// Portfolio Reports
// ============================================================================

export async function listReports(limit = 10): Promise<PortfolioReport[]> {
  return db
    .select()
    .from(portfolioReports)
    .orderBy(desc(portfolioReports.createdAt))
    .limit(limit);
}

export async function getReport(id: number): Promise<PortfolioReport | null> {
  const [report] = await db
    .select()
    .from(portfolioReports)
    .where(eq(portfolioReports.id, id));
  return report || null;
}

export async function getLatestReport(): Promise<PortfolioReport | null> {
  const [report] = await db
    .select()
    .from(portfolioReports)
    .orderBy(desc(portfolioReports.createdAt))
    .limit(1);
  return report || null;
}

export interface CreateReportInput {
  content: string;
  summary?: string;
  totalTickers?: number;
}

export async function createReport(input: CreateReportInput): Promise<PortfolioReport> {
  const [newReport] = await db
    .insert(portfolioReports)
    .values({
      content: input.content,
      summary: input.summary ?? null,
      totalTickers: input.totalTickers ?? null,
    })
    .returning();

  return newReport;
}

export async function deleteReport(id: number): Promise<boolean> {
  const [existing] = await db
    .select({ id: portfolioReports.id })
    .from(portfolioReports)
    .where(eq(portfolioReports.id, id));

  if (!existing) {
    return false;
  }

  await db.delete(portfolioReports).where(eq(portfolioReports.id, id));
  return true;
}

// ============================================================================
// Analysis Helpers
// ============================================================================

export async function getTotalAllocation(): Promise<number> {
  const holdings = await listHoldings();
  return holdings.reduce((sum, h) => sum + (h.targetAllocation || 0), 0);
}

export async function getHoldingTickers(): Promise<string[]> {
  const holdings = await listHoldings();
  return holdings.map((h) => h.ticker);
}
