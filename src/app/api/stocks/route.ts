import { NextRequest, NextResponse } from "next/server";
import { db, stockReports } from "@/db";
import { desc } from "drizzle-orm";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/stocks — list all stock reports
export async function GET() {
  try {
    const reports = await db
      .select()
      .from(stockReports)
      .orderBy(desc(stockReports.createdAt));
    
    return NextResponse.json({ reports });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/stocks — add a new stock report (for API use)
export async function POST(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { ticker, title, content, report_type } = body;

    if (!ticker || !content) {
      return NextResponse.json(
        { error: "ticker and content are required" },
        { status: 400 }
      );
    }

    const [newReport] = await db
      .insert(stockReports)
      .values({
        ticker: ticker.toUpperCase(),
        title: title || `Sun Tzu Report: ${ticker.toUpperCase()}`,
        content,
        reportType: report_type || "sun-tzu",
      })
      .returning();

    return NextResponse.json({
      ok: true,
      id: newReport.id,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
