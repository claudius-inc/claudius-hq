import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cftcPositions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { parseCftcText } from "@/lib/cftc/parser";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const CFTC_URL = "https://www.cftc.gov/dea/newcot/deacmesf.txt";

// POST /api/cftc/sync — Fetch and parse latest CFTC data
export async function POST(request: NextRequest) {
  try {
    logger.info("api/cftc/sync", "Starting CFTC data sync");

    const res = await fetch(CFTC_URL, { cache: "no-store" });
    if (!res.ok) {
      logger.error("api/cftc/sync", `CFTC fetch failed: ${res.status}`);
      return NextResponse.json(
        { error: `CFTC fetch failed: ${res.status}` },
        { status: 502 },
      );
    }

    const text = await res.text();
    const parsed = parseCftcText(text);

    if (parsed.length === 0) {
      logger.warn("api/cftc/sync", "No target contracts found in CFTC data");
      return NextResponse.json({ synced: 0, message: "No target contracts found" });
    }

    let inserted = 0;
    let skipped = 0;

    for (const row of parsed) {
      // Check if we already have this report date + commodity
      const existing = await db
        .select({ id: cftcPositions.id })
        .from(cftcPositions)
        .where(
          and(
            eq(cftcPositions.reportDate, row.reportDate),
            eq(cftcPositions.commodity, row.commodity),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(cftcPositions).values({
        reportDate: row.reportDate,
        commodity: row.commodity,
        noncommercialLong: row.noncommercialLong,
        noncommercialShort: row.noncommercialShort,
        netSpeculative: row.netSpeculative,
        commercialLong: row.commercialLong,
        commercialShort: row.commercialShort,
        openInterest: row.openInterest,
        source: "cftc",
      });
      inserted++;
    }

    logger.info("api/cftc/sync", `CFTC sync complete: ${inserted} inserted, ${skipped} skipped`);
    return NextResponse.json({ synced: inserted, skipped, total: parsed.length });
  } catch (e) {
    logger.error("api/cftc/sync", "CFTC sync error", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
