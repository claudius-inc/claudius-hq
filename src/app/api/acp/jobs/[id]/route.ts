import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { 
  acpJobs, 
  acpOfferings, 
  acpState, 
  acpActivities, 
  acpOfferingMetrics 
} from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * GET /api/acp/jobs/[id]
 * Get a single job by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const jobs = await db
      .select()
      .from(acpJobs)
      .where(eq(acpJobs.id, id))
      .limit(1);

    if (jobs.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job: jobs[0] });
  } catch (error) {
    logger.error("api/acp/jobs/[id]", `Error fetching job ${id}`, { error });
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
  }
}

/**
 * PATCH /api/acp/jobs/[id]
 * Update job status on completion/failure
 * 
 * Body: { status, result?, error?, completedAt, executionMs }
 * 
 * On completion:
 *   1. Update job record
 *   2. Increment acp_offerings.jobCount and totalRevenue
 *   3. Increment acp_state.jobsThisEpoch and revenueThisEpoch  
 *   4. Insert acp_activities entry
 *   5. Update acp_offering_metrics for today (upsert)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { status, result, error, completedAt, executionMs } = body;

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    // Get the existing job
    const existingJobs = await db
      .select()
      .from(acpJobs)
      .where(eq(acpJobs.id, id))
      .limit(1);

    if (existingJobs.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const existingJob = existingJobs[0];
    
    // Don't update if already completed/failed (idempotency)
    if (existingJob.status !== "pending") {
      return NextResponse.json({ 
        success: true, 
        job: existingJob,
        message: `Job already in ${existingJob.status} state`
      });
    }

    // 1. Update job record
    const [updatedJob] = await db
      .update(acpJobs)
      .set({
        status,
        result: result || null,
        error: error || null,
        completedAt: completedAt || new Date().toISOString(),
        executionMs: executionMs || null,
      })
      .where(eq(acpJobs.id, id))
      .returning();

    const offering = existingJob.offering;
    const amount = existingJob.amount || 0;
    const buyer = existingJob.buyer;
    const today = getToday();

    if (status === "completed") {
      // 2. Increment acp_offerings.jobCount and totalRevenue
      await db
        .update(acpOfferings)
        .set({
          jobCount: sql`${acpOfferings.jobCount} + 1`,
          totalRevenue: sql`${acpOfferings.totalRevenue} + ${amount}`,
          lastJobAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(acpOfferings.name, offering));

      // 3. Increment acp_state.jobsThisEpoch and revenueThisEpoch
      await db
        .update(acpState)
        .set({
          jobsThisEpoch: sql`COALESCE(${acpState.jobsThisEpoch}, 0) + 1`,
          revenueThisEpoch: sql`COALESCE(${acpState.revenueThisEpoch}, 0) + ${amount}`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(acpState.id, 1));

      // 4. Insert acp_activities entry
      await db.insert(acpActivities).values({
        type: "job_completed",
        jobId: id,
        offering,
        counterparty: buyer,
        amount,
        details: JSON.stringify({
          executionMs,
          result: result?.substring?.(0, 200) || result,
        }),
        outcome: "success",
      });

      // 5. Update acp_offering_metrics for today (upsert)
      // First, get the offering ID
      const offeringRows = await db
        .select({ id: acpOfferings.id })
        .from(acpOfferings)
        .where(eq(acpOfferings.name, offering))
        .limit(1);

      if (offeringRows.length > 0) {
        const offeringId = offeringRows[0].id;

        // Check if metric row exists for today
        const existingMetrics = await db
          .select()
          .from(acpOfferingMetrics)
          .where(and(
            eq(acpOfferingMetrics.offeringId, offeringId),
            eq(acpOfferingMetrics.date, today)
          ))
          .limit(1);

        if (existingMetrics.length > 0) {
          // Update existing metric
          const currentAvg = existingMetrics[0].avgCompletionTimeMs || 0;
          const currentCount = existingMetrics[0].jobsCount || 0;
          const newAvg = executionMs 
            ? Math.round((currentAvg * currentCount + executionMs) / (currentCount + 1))
            : currentAvg;

          await db
            .update(acpOfferingMetrics)
            .set({
              jobsCount: sql`${acpOfferingMetrics.jobsCount} + 1`,
              revenue: sql`${acpOfferingMetrics.revenue} + ${amount}`,
              avgCompletionTimeMs: newAvg,
            })
            .where(and(
              eq(acpOfferingMetrics.offeringId, offeringId),
              eq(acpOfferingMetrics.date, today)
            ));
        } else {
          // Create new metric row for today
          await db.insert(acpOfferingMetrics).values({
            offeringId,
            date: today,
            jobsCount: 1,
            revenue: amount,
            uniqueBuyers: 1,
            avgCompletionTimeMs: executionMs || null,
            failureCount: 0,
          });
        }
      }

      logger.info("api/acp/jobs/[id]", `Job completed: ${id} for ${offering}, earned $${amount}`);
    } else if (status === "failed") {
      // Log failure activity
      await db.insert(acpActivities).values({
        type: "job_failed",
        jobId: id,
        offering,
        counterparty: buyer,
        details: JSON.stringify({ error, executionMs }),
        outcome: "failed",
      });

      // Update failure count in metrics
      const offeringRows = await db
        .select({ id: acpOfferings.id })
        .from(acpOfferings)
        .where(eq(acpOfferings.name, offering))
        .limit(1);

      if (offeringRows.length > 0) {
        const offeringId = offeringRows[0].id;

        const existingMetrics = await db
          .select()
          .from(acpOfferingMetrics)
          .where(and(
            eq(acpOfferingMetrics.offeringId, offeringId),
            eq(acpOfferingMetrics.date, today)
          ))
          .limit(1);

        if (existingMetrics.length > 0) {
          await db
            .update(acpOfferingMetrics)
            .set({
              failureCount: sql`COALESCE(${acpOfferingMetrics.failureCount}, 0) + 1`,
            })
            .where(and(
              eq(acpOfferingMetrics.offeringId, offeringId),
              eq(acpOfferingMetrics.date, today)
            ));
        } else {
          await db.insert(acpOfferingMetrics).values({
            offeringId,
            date: today,
            jobsCount: 0,
            revenue: 0,
            failureCount: 1,
          });
        }
      }

      logger.warn("api/acp/jobs/[id]", `Job failed: ${id} for ${offering} - ${error}`);
    }

    // Invalidate ISR cache for ACP pages
    revalidatePath("/acp");
    revalidatePath("/acp/tasks");

    return NextResponse.json({ 
      success: true, 
      job: updatedJob,
      message: `Job marked as ${status}`
    });
  } catch (error) {
    logger.error("api/acp/jobs/[id]", `Error updating job ${id}`, { error });
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}
