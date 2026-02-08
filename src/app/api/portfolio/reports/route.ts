import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";
import { PortfolioReport } from "@/lib/types";

// GET /api/portfolio/reports — List all portfolio reports
export async function GET() {
  await ensureDB();
  try {
    const result = await db.execute(
      "SELECT * FROM portfolio_reports ORDER BY created_at DESC"
    );
    return NextResponse.json({ reports: result.rows as unknown as PortfolioReport[] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/portfolio/reports — Create new portfolio report
export async function POST(req: NextRequest) {
  // Only allow API-authenticated calls (from skills/agents)
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDB();
  try {
    const body = await req.json();
    const { content, summary, total_tickers } = body;

    if (!content) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    const result = await db.execute({
      sql: `INSERT INTO portfolio_reports (content, summary, total_tickers) 
            VALUES (?, ?, ?)`,
      args: [content, summary ?? null, total_tickers ?? null],
    });

    const newReport = await db.execute({
      sql: "SELECT * FROM portfolio_reports WHERE id = ?",
      args: [result.lastInsertRowid!],
    });

    return NextResponse.json(
      { report: newReport.rows[0] as unknown as PortfolioReport },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
