import { NextRequest, NextResponse } from "next/server";
import { db, portfolioReports } from "@/db";
import { desc } from "drizzle-orm";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/portfolio/reports — List all portfolio reports
export async function GET() {
  try {
    const reports = await db
      .select()
      .from(portfolioReports)
      .orderBy(desc(portfolioReports.createdAt));
    
    return NextResponse.json({ reports });
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

  try {
    const body = await req.json();
    const { content, summary, total_tickers } = body;

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const [newReport] = await db
      .insert(portfolioReports)
      .values({
        content,
        summary: summary ?? null,
        totalTickers: total_tickers ?? null,
      })
      .returning();

    return NextResponse.json({ report: newReport }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
