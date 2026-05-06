import { NextRequest, NextResponse } from "next/server";
import { db, scannerUniverse } from "@/db";
import { or, like, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

// GET /api/tickers/search?q=nvda&limit=8
// Searches scanner_universe by ticker or name (case-insensitive prefix-ish).
// Ranks exact-ticker > ticker-prefix > ticker-contains > name-contains.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const qRaw = searchParams.get("q") ?? "";
  const limitRaw = searchParams.get("limit");
  const q = qRaw.trim();
  const limit = Math.max(1, Math.min(20, Number(limitRaw) || 8));

  if (q.length === 0) {
    return NextResponse.json({ results: [] });
  }

  try {
    const upper = q.toUpperCase();
    const lower = q.toLowerCase();

    const rows = await db
      .select({
        ticker: scannerUniverse.ticker,
        name: scannerUniverse.name,
        market: scannerUniverse.market,
        sector: scannerUniverse.sector,
      })
      .from(scannerUniverse)
      .where(
        or(
          like(scannerUniverse.ticker, `%${upper}%`),
          like(sql`lower(${scannerUniverse.name})`, `%${lower}%`),
        ),
      )
      .limit(limit * 4);

    const ranked = rows
      .map((r) => {
        const t = r.ticker.toUpperCase();
        const n = (r.name ?? "").toLowerCase();
        let score = 99;
        if (t === upper) score = 0;
        else if (t.startsWith(upper)) score = 1;
        else if (t.includes(upper)) score = 2;
        else if (n.startsWith(lower)) score = 3;
        else if (n.includes(lower)) score = 4;
        return { ...r, score };
      })
      .sort((a, b) => a.score - b.score || a.ticker.localeCompare(b.ticker))
      .slice(0, limit)
      .map(({ score: _score, ...rest }) => rest);

    return NextResponse.json({ results: ranked });
  } catch (e) {
    logger.error("api/tickers/search", "Search failed", { error: e, q });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
