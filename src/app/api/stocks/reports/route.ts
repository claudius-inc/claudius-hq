import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/stocks/reports — list all reports, optionally filter by ticker
export async function GET(req: NextRequest) {
  await ensureDB();
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker");

    let sql = "SELECT * FROM stock_reports";
    const args: string[] = [];

    if (ticker) {
      sql += " WHERE ticker = ?";
      args.push(ticker.toUpperCase());
    }

    sql += " ORDER BY created_at DESC";

    const result = await db.execute({ sql, args });
    return NextResponse.json({ reports: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/stocks/reports — add a new report
export async function POST(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDB();
  try {
    const body = await req.json();
    const { ticker, title, content, report_type } = body;

    if (!ticker || !content) {
      return NextResponse.json(
        { error: "ticker and content are required" },
        { status: 400 }
      );
    }

    const result = await db.execute({
      sql: `INSERT INTO stock_reports (ticker, title, content, report_type) 
            VALUES (?, ?, ?, ?)`,
      args: [
        ticker.toUpperCase(),
        title || `Sun Tzu Report: ${ticker.toUpperCase()}`,
        content,
        report_type || "sun-tzu",
      ],
    });

    const newReport = await db.execute({
      sql: "SELECT * FROM stock_reports WHERE id = ?",
      args: [result.lastInsertRowid!],
    });

    return NextResponse.json({ report: newReport.rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
