import { NextRequest, NextResponse } from "next/server";
import { db, stockScans } from "@/db";
import { desc, eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ type: string }>;
}

// GET /api/stocks/scans/[type] — get latest scan by type
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { type } = await params;
    
    const [scan] = await db
      .select()
      .from(stockScans)
      .where(eq(stockScans.scanType, type))
      .orderBy(desc(stockScans.scannedAt))
      .limit(1);

    if (!scan) {
      return NextResponse.json(
        { error: `No scans found for type: ${type}` },
        { status: 404 }
      );
    }

    // Parse JSON fields
    const parsed = {
      ...scan,
      results: JSON.parse(scan.results || "[]"),
      summary: scan.summary ? JSON.parse(scan.summary) : null,
    };

    return NextResponse.json({ scan: parsed });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
