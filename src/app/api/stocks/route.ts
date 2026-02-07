import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/stocks — list all stock reports
export async function GET() {
  await ensureDB();
  try {
    const result = await db.execute(`
      SELECT * FROM stock_reports ORDER BY created_at DESC
    `);
    return NextResponse.json({ reports: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/stocks — add a new stock report (for API use)
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

    return NextResponse.json({
      ok: true,
      id: Number(result.lastInsertRowid),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
