/**
 * Stock Reports Service
 * Handles CRUD operations for stock reports
 */
import { db, stockReports, researchJobs } from "@/db";
import { desc, eq } from "drizzle-orm";
import type { StockReport, NewStockReport } from "@/db/schema";

// ============================================================================
// Stock Reports
// ============================================================================

export async function listStockReports(ticker?: string): Promise<StockReport[]> {
  if (ticker) {
    return db
      .select()
      .from(stockReports)
      .where(eq(stockReports.ticker, ticker.toUpperCase()))
      .orderBy(desc(stockReports.createdAt));
  }
  return db.select().from(stockReports).orderBy(desc(stockReports.createdAt));
}

export async function getStockReport(id: number): Promise<StockReport | null> {
  const [report] = await db
    .select()
    .from(stockReports)
    .where(eq(stockReports.id, id));
  return report || null;
}

export async function getStockReportByTicker(ticker: string): Promise<StockReport | null> {
  const [report] = await db
    .select()
    .from(stockReports)
    .where(eq(stockReports.ticker, ticker.toUpperCase()))
    .orderBy(desc(stockReports.createdAt))
    .limit(1);
  return report || null;
}

/**
 * Extract company name from report title
 */
function extractCompanyName(title: string, ticker: string): string {
  if (!title) return "";

  // Pattern 1: "Company Name (TICKER)..." or "Company Name (TICKER.SI)..."
  const match1 = title.match(/^([^(]+)\s*\([^)]+\)/);
  if (match1) {
    return match1[1].trim();
  }

  // Pattern 2: "TICKER - Company Name..." or "TICKER: Company Name..."
  const match2 = title.match(new RegExp(`^${ticker}\\s*[-:]\\s*([^—–-]+)`, "i"));
  if (match2) {
    return match2[1].trim();
  }

  // Pattern 3: "The Art of... Analysis of Company Name"
  const match3 = title.match(/Analysis of\s+([^(]+)/i);
  if (match3) {
    return match3[1].trim().replace(/\s+Ltd\.?$/, "");
  }

  return "";
}

export interface CreateStockReportInput {
  ticker: string;
  title?: string;
  content: string;
  reportType?: string;
  companyName?: string;
  relatedTickers?: string[] | string;
}

export async function createStockReport(input: CreateStockReportInput): Promise<StockReport> {
  const cleanTicker = input.ticker.toUpperCase();
  const finalTitle = input.title || `Sun Tzu Report: ${cleanTicker}`;

  // Use provided company_name or extract from title
  const finalCompanyName = input.companyName || extractCompanyName(finalTitle, cleanTicker);

  // Handle related_tickers - store as JSON string
  let relatedTickersJson = "";
  if (input.relatedTickers) {
    if (Array.isArray(input.relatedTickers)) {
      relatedTickersJson = JSON.stringify(input.relatedTickers.map((t) => t.toUpperCase()));
    } else {
      relatedTickersJson = input.relatedTickers;
    }
  }

  const [newReport] = await db
    .insert(stockReports)
    .values({
      ticker: cleanTicker,
      title: finalTitle,
      content: input.content,
      reportType: input.reportType || "sun-tzu",
      companyName: finalCompanyName,
      relatedTickers: relatedTickersJson,
    })
    .returning();

  return newReport;
}

export interface UpdateStockReportInput {
  companyName?: string;
  ticker?: string;
  title?: string;
  content?: string;
}

export async function updateStockReport(
  id: number,
  input: UpdateStockReportInput
): Promise<boolean> {
  const updateData: Partial<typeof stockReports.$inferInsert> = {};

  if (input.companyName !== undefined) {
    updateData.companyName = input.companyName;
  }
  if (input.ticker !== undefined) {
    updateData.ticker = input.ticker.toUpperCase();
  }
  if (input.title !== undefined) {
    updateData.title = input.title;
  }
  if (input.content !== undefined) {
    updateData.content = input.content;
  }

  if (Object.keys(updateData).length === 0) {
    return false;
  }

  await db.update(stockReports).set(updateData).where(eq(stockReports.id, id));
  return true;
}

export async function deleteStockReport(id: number): Promise<boolean> {
  // Check if report exists
  const [existing] = await db
    .select({ id: stockReports.id })
    .from(stockReports)
    .where(eq(stockReports.id, id));

  if (!existing) {
    return false;
  }

  // Clear foreign key references in research_jobs first
  await db
    .update(researchJobs)
    .set({ reportId: null })
    .where(eq(researchJobs.reportId, id));

  // Now delete the report
  await db.delete(stockReports).where(eq(stockReports.id, id));
  return true;
}
