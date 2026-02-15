import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stockReports } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

// GET: List all reports or get specific report by id
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      // Get specific report
      const report = await db
        .select()
        .from(stockReports)
        .where(eq(stockReports.id, parseInt(id)))
        .limit(1);

      if (report.length === 0) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }

      return NextResponse.json({ report: report[0] });
    }

    // List all reports
    const reports = await db
      .select()
      .from(stockReports)
      .orderBy(desc(stockReports.createdAt));

    return NextResponse.json({ reports });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
