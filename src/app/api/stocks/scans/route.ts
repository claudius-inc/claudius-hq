import { NextRequest, NextResponse } from "next/server";
import { db, stockScans } from "@/db";
import { desc, eq } from "drizzle-orm";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/stocks/scans — list all scans (latest first)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scanType = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "10");

    let query = db.select().from(stockScans);

    if (scanType) {
      query = query.where(eq(stockScans.scanType, scanType)) as typeof query;
    }

    const scans = await query
      .orderBy(desc(stockScans.scannedAt))
      .limit(limit);

    // Parse JSON fields
    const parsed = scans.map((scan) => ({
      ...scan,
      results: JSON.parse(scan.results || "[]"),
      summary: scan.summary ? JSON.parse(scan.summary) : null,
    }));

    return NextResponse.json({ scans: parsed });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/stocks/scans — save new scan results
export async function POST(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { scan_type, results, summary, scanned_at } = body;

    if (!scan_type || !results) {
      return NextResponse.json(
        { error: "scan_type and results are required" },
        { status: 400 }
      );
    }

    const [newScan] = await db
      .insert(stockScans)
      .values({
        scanType: scan_type,
        results: JSON.stringify(results),
        summary: summary ? JSON.stringify(summary) : null,
        scannedAt: scanned_at || new Date().toISOString(),
        stockCount: Array.isArray(results) ? results.length : 0,
      })
      .returning();

    return NextResponse.json({
      ok: true,
      id: newScan.id,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
