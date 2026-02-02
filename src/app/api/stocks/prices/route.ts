import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";

// GET /api/stocks/prices?ticker=XXX&limit=30
export async function GET(req: NextRequest) {
  await ensureDB();
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker");
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    if (!ticker) {
      return NextResponse.json({ error: "ticker required" }, { status: 400 });
    }

    const result = await db.execute({
      sql: "SELECT * FROM stock_prices WHERE ticker = ? ORDER BY recorded_at DESC LIMIT ?",
      args: [ticker, limit],
    });
    return NextResponse.json({ prices: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/stocks/prices — record price(s)
export async function POST(req: NextRequest) {
  await ensureDB();
  try {
    const body = await req.json();
    const entries = Array.isArray(body) ? body : [body];

    for (const entry of entries) {
      const { ticker, price, change_amount, change_pct, recorded_at } = entry;
      if (!ticker || price === undefined) continue;
      await db.execute({
        sql: `INSERT INTO stock_prices (ticker, price, change_amount, change_pct, recorded_at)
              VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))`,
        args: [ticker, price, change_amount || 0, change_pct || 0, recorded_at || null],
      });
    }
    return NextResponse.json({ ok: true, count: entries.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
