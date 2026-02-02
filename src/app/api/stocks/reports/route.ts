import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";

// GET /api/stocks/reports?ticker=XXX&limit=10
export async function GET(req: NextRequest) {
  await ensureDB();
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker");
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    let result;
    if (ticker) {
      result = await db.execute({
        sql: "SELECT * FROM stock_reports WHERE ticker = ? ORDER BY created_at DESC LIMIT ?",
        args: [ticker, limit],
      });
    } else {
      result = await db.execute({
        sql: "SELECT * FROM stock_reports ORDER BY created_at DESC LIMIT ?",
        args: [limit],
      });
    }
    return NextResponse.json({ reports: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/stocks/reports — add a report
export async function POST(req: NextRequest) {
  await ensureDB();
  try {
    const { ticker, title, content, report_type } = await req.json();
    if (!ticker || !title) {
      return NextResponse.json({ error: "ticker, title required" }, { status: 400 });
    }
    await db.execute({
      sql: "INSERT INTO stock_reports (ticker, title, content, report_type) VALUES (?, ?, ?, ?)",
      args: [ticker, title, content || "", report_type || "analysis"],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
