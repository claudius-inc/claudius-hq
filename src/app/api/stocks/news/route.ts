import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";

// GET /api/stocks/news?ticker=XXX&limit=20
export async function GET(req: NextRequest) {
  await ensureDB();
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker");
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    let result;
    if (ticker) {
      result = await db.execute({
        sql: "SELECT * FROM stock_news WHERE ticker = ? ORDER BY published_at DESC LIMIT ?",
        args: [ticker, limit],
      });
    } else {
      result = await db.execute({
        sql: "SELECT * FROM stock_news ORDER BY published_at DESC LIMIT ?",
        args: [limit],
      });
    }
    return NextResponse.json({ news: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/stocks/news — add news item(s)
export async function POST(req: NextRequest) {
  await ensureDB();
  try {
    const body = await req.json();
    const entries = Array.isArray(body) ? body : [body];

    for (const entry of entries) {
      const { ticker, headline, summary, source, url, sentiment, published_at } = entry;
      if (!headline) continue;
      await db.execute({
        sql: `INSERT INTO stock_news (ticker, headline, summary, source, url, sentiment, published_at)
              VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
        args: [ticker || null, headline, summary || "", source || "", url || "", sentiment || "neutral", published_at || null],
      });
    }
    return NextResponse.json({ ok: true, count: entries.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
