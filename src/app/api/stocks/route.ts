import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";

// GET /api/stocks — list watchlist with latest prices
export async function GET() {
  await ensureDB();
  try {
    const result = await db.execute(`
      SELECT w.*, sp.price, sp.change_amount, sp.change_pct, sp.recorded_at
      FROM watchlist_stocks w
      LEFT JOIN stock_prices sp ON sp.ticker = w.ticker
        AND sp.recorded_at = (SELECT MAX(sp2.recorded_at) FROM stock_prices sp2 WHERE sp2.ticker = w.ticker)
      ORDER BY w.category DESC, w.name ASC
    `);
    return NextResponse.json({ stocks: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/stocks — add to watchlist
export async function POST(req: NextRequest) {
  await ensureDB();
  try {
    const body = await req.json();
    const { ticker, exchange, name, category, notes } = body;
    if (!ticker || !exchange || !name) {
      return NextResponse.json({ error: "ticker, exchange, name required" }, { status: 400 });
    }
    await db.execute({
      sql: "INSERT OR IGNORE INTO watchlist_stocks (ticker, exchange, name, category, notes) VALUES (?, ?, ?, ?, ?)",
      args: [ticker, exchange, name, category || "watchlist", notes || ""],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/stocks — remove from watchlist
export async function DELETE(req: NextRequest) {
  await ensureDB();
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker");
    if (!ticker) {
      return NextResponse.json({ error: "ticker required" }, { status: 400 });
    }
    await db.execute({ sql: "DELETE FROM watchlist_stocks WHERE ticker = ?", args: [ticker] });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
