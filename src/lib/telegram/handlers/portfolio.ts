// Portfolio command handler

import { db, portfolioHoldings } from "@/db";
import { desc } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";
import { formatPrice, formatPercent, getEmoji } from "../utils";
import type { QuoteResult } from "../types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

export async function handlePortfolio(): Promise<string> {
  const holdings = await db
    .select()
    .from(portfolioHoldings)
    .orderBy(desc(portfolioHoldings.targetAllocation));

  if (holdings.length === 0) {
    return "📊 <b>Portfolio</b>\n\nNo holdings yet. Add them at claudiusinc.com/stocks/portfolio";
  }

  const lines: string[] = ["📊 <b>Portfolio</b>\n"];
  
  for (const h of holdings) {
    try {
      const quote = await yahooFinance.quote(h.ticker) as QuoteResult;
      const price = quote?.regularMarketPrice ?? 0;
      const change = quote?.regularMarketChangePercent ?? 0;
      lines.push(`${h.ticker}  ${formatPrice(price)}  ${formatPercent(change)} ${getEmoji(change)}`);
    } catch {
      lines.push(`${h.ticker}  - (error)`);
    }
  }

  lines.push(`\nclaudiusinc.com/stocks/portfolio`);
  return lines.join("\n");
}
