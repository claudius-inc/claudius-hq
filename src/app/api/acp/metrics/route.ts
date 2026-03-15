import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import { db } from "@/db";
import { acpOfferingMetrics, acpOfferings } from "@/db/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch metrics with filters
export async function GET(req: NextRequest) {
  if (!checkApiAuth(req)) return unauthorizedResponse();
  try {
  if (!checkApiAuth(req)) return unauthorizedResponse();
    const { searchParams } = new URL(req.url);
    const offeringId = searchParams.get("offering_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const limit = searchParams.get("limit");
    const includeSummary = searchParams.get("include_summary") === "true";

    const conditions = [];
    if (offeringId) {
      conditions.push(eq(acpOfferingMetrics.offeringId, parseInt(offeringId)));
    }
    if (startDate) {
      conditions.push(gte(acpOfferingMetrics.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(acpOfferingMetrics.date, endDate));
    }

    let query = db
      .select()
      .from(acpOfferingMetrics)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(acpOfferingMetrics.date));

    if (limit) {
      query = query.limit(parseInt(limit)) as typeof query;
    }

    const metrics = await query;

    // Calculate summary if requested
    let summary = null;
    if (includeSummary && metrics.length > 0) {
      const totalJobs = metrics.reduce((sum, m) => sum + (m.jobsCount || 0), 0);
      const totalRevenue = metrics.reduce((sum, m) => sum + (m.revenue || 0), 0);
      const validConversions = metrics.filter((m) => m.conversionRate !== null);
      const avgConversionRate =
        validConversions.length > 0
          ? validConversions.reduce((sum, m) => sum + (m.conversionRate || 0), 0) / validConversions.length
          : null;
      const validCompletionTimes = metrics.filter((m) => m.avgCompletionTimeMs !== null);
      const avgCompletionTime =
        validCompletionTimes.length > 0
          ? validCompletionTimes.reduce((sum, m) => sum + (m.avgCompletionTimeMs || 0), 0) / validCompletionTimes.length
          : null;

      const dates = metrics.map((m) => m.date).sort();
      summary = {
        totalJobs,
        totalRevenue,
        avgConversionRate,
        avgCompletionTime,
        periodStart: dates[0],
        periodEnd: dates[dates.length - 1],
      };
    }

    return NextResponse.json({ metrics, summary });
  } catch (error) {
    logger.error("api/acp/metrics", "Error fetching metrics", { error });
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}

// POST: Record or update daily metrics
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { offeringId, date, jobsCount, revenue, uniqueBuyers, views, conversionRate, avgCompletionTimeMs, failureCount } =
      body;

    if (!offeringId || !date) {
      return NextResponse.json({ error: "offeringId and date are required" }, { status: 400 });
    }

    // Check if offering exists
    const [offering] = await db.select().from(acpOfferings).where(eq(acpOfferings.id, offeringId)).limit(1);

    if (!offering) {
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    // Upsert: update if exists, insert if not
    const existing = await db
      .select()
      .from(acpOfferingMetrics)
      .where(and(eq(acpOfferingMetrics.offeringId, offeringId), eq(acpOfferingMetrics.date, date)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(acpOfferingMetrics)
        .set({
          jobsCount: jobsCount ?? existing[0].jobsCount,
          revenue: revenue ?? existing[0].revenue,
          uniqueBuyers: uniqueBuyers ?? existing[0].uniqueBuyers,
          views: views ?? existing[0].views,
          conversionRate: conversionRate ?? existing[0].conversionRate,
          avgCompletionTimeMs: avgCompletionTimeMs ?? existing[0].avgCompletionTimeMs,
          failureCount: failureCount ?? existing[0].failureCount,
        })
        .where(and(eq(acpOfferingMetrics.offeringId, offeringId), eq(acpOfferingMetrics.date, date)))
        .returning();

      return NextResponse.json({ success: true, metric: updated, action: "updated" });
    } else {
      const [inserted] = await db
        .insert(acpOfferingMetrics)
        .values({
          offeringId,
          date,
          jobsCount: jobsCount || 0,
          revenue: revenue || 0,
          uniqueBuyers: uniqueBuyers || 0,
          views: views || 0,
          conversionRate: conversionRate || null,
          avgCompletionTimeMs: avgCompletionTimeMs || null,
          failureCount: failureCount || 0,
        })
        .returning();

      return NextResponse.json({ success: true, metric: inserted, action: "created" });
    }
  } catch (error) {
    logger.error("api/acp/metrics", "Error recording metrics", { error });
    return NextResponse.json({ error: "Failed to record metrics" }, { status: 500 });
  }
}

// POST bulk metrics
export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { metrics } = body;

    if (!Array.isArray(metrics)) {
      return NextResponse.json({ error: "metrics array is required" }, { status: 400 });
    }

    const results = [];
    for (const m of metrics) {
      const { offeringId, date, jobsCount, revenue, uniqueBuyers, views, conversionRate, avgCompletionTimeMs, failureCount } =
        m;

      if (!offeringId || !date) continue;

      const existing = await db
        .select()
        .from(acpOfferingMetrics)
        .where(and(eq(acpOfferingMetrics.offeringId, offeringId), eq(acpOfferingMetrics.date, date)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(acpOfferingMetrics)
          .set({
            jobsCount: jobsCount ?? existing[0].jobsCount,
            revenue: revenue ?? existing[0].revenue,
            uniqueBuyers: uniqueBuyers ?? existing[0].uniqueBuyers,
            views: views ?? existing[0].views,
            conversionRate: conversionRate ?? existing[0].conversionRate,
            avgCompletionTimeMs: avgCompletionTimeMs ?? existing[0].avgCompletionTimeMs,
            failureCount: failureCount ?? existing[0].failureCount,
          })
          .where(and(eq(acpOfferingMetrics.offeringId, offeringId), eq(acpOfferingMetrics.date, date)));
        results.push({ offeringId, date, action: "updated" });
      } else {
        await db.insert(acpOfferingMetrics).values({
          offeringId,
          date,
          jobsCount: jobsCount || 0,
          revenue: revenue || 0,
          uniqueBuyers: uniqueBuyers || 0,
          views: views || 0,
          conversionRate: conversionRate || null,
          avgCompletionTimeMs: avgCompletionTimeMs || null,
          failureCount: failureCount || 0,
        });
        results.push({ offeringId, date, action: "created" });
      }
    }

    return NextResponse.json({ success: true, count: results.length, results });
  } catch (error) {
    logger.error("api/acp/metrics", "Error bulk recording metrics", { error });
    return NextResponse.json({ error: "Failed to bulk record metrics" }, { status: 500 });
  }
}

// DELETE: Delete metrics by offering_id and optional date range
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const offeringId = searchParams.get("offering_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!offeringId) {
      return NextResponse.json({ error: "offering_id query param is required" }, { status: 400 });
    }

    const conditions = [eq(acpOfferingMetrics.offeringId, parseInt(offeringId))];
    if (startDate) {
      conditions.push(gte(acpOfferingMetrics.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(acpOfferingMetrics.date, endDate));
    }

    const deleted = await db
      .delete(acpOfferingMetrics)
      .where(and(...conditions))
      .returning();

    return NextResponse.json({ success: true, deletedCount: deleted.length });
  } catch (error) {
    logger.error("api/acp/metrics", "Error deleting metrics", { error });
    return NextResponse.json({ error: "Failed to delete metrics" }, { status: 500 });
  }
}
