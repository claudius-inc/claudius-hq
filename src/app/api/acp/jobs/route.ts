import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import { db } from "@/db";
import { acpJobs, acpState, acpActivities } from "@/db/schema";
import { desc, eq, and, gte, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

/**
 * GET /api/acp/jobs
 * Query jobs with optional filters
 * 
 * Query params:
 * - offering: Filter by offering name
 * - status: Filter by status (pending/completed/failed)
 * - since: Filter by date (ISO string, jobs started after this time)
 * - limit: Max results (default 100)
 */
export async function GET(req: NextRequest) {
  if (!checkApiAuth(req)) return unauthorizedResponse();
  const { searchParams } = new URL(req.url);
  if (!checkApiAuth(req)) return unauthorizedResponse();
  const offering = searchParams.get("offering");
  const status = searchParams.get("status");
  const since = searchParams.get("since");
  const limit = parseInt(searchParams.get("limit") || "100");

  try {
    // Build conditions array
    const conditions = [];
    
    if (offering) {
      conditions.push(eq(acpJobs.offering, offering));
    }
    if (status) {
      conditions.push(eq(acpJobs.status, status));
    }
    if (since) {
      conditions.push(gte(acpJobs.startedAt, since));
    }

    const query = conditions.length > 0
      ? db.select().from(acpJobs).where(and(...conditions))
      : db.select().from(acpJobs);

    const jobs = await query
      .orderBy(desc(acpJobs.createdAt))
      .limit(limit);

    // Compute aggregate stats
    const stats = {
      total: jobs.length,
      completed: jobs.filter(j => j.status === "completed").length,
      failed: jobs.filter(j => j.status === "failed").length,
      pending: jobs.filter(j => j.status === "pending").length,
      totalRevenue: jobs
        .filter(j => j.status === "completed" && j.amount)
        .reduce((sum, j) => sum + (j.amount || 0), 0),
    };

    return NextResponse.json({ jobs, stats });
  } catch (error) {
    logger.error("api/acp/jobs", "Error fetching jobs", { error });
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

/**
 * POST /api/acp/jobs
 * Create a new job record when a job starts
 * 
 * Body: { jobId, offering, buyer, amount, input, startedAt }
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { jobId, offering, buyer, amount, input, startedAt } = body;

    if (!jobId || !offering) {
      return NextResponse.json(
        { error: "jobId and offering are required" },
        { status: 400 }
      );
    }

    // Check if job already exists (avoid duplicates)
    const existing = await db
      .select()
      .from(acpJobs)
      .where(eq(acpJobs.id, jobId))
      .limit(1);

    if (existing.length > 0) {
      // Job already exists, return it
      return NextResponse.json({ 
        success: true, 
        job: existing[0],
        created: false,
        message: "Job already exists"
      });
    }

    // Create new job record
    const [job] = await db
      .insert(acpJobs)
      .values({
        id: jobId,
        offering,
        buyer: buyer || null,
        amount: amount || null,
        input: typeof input === "object" ? JSON.stringify(input) : input,
        status: "pending",
        startedAt: startedAt || new Date().toISOString(),
      })
      .returning();

    logger.info("api/acp/jobs", `Job started: ${jobId} for offering ${offering}`);

    return NextResponse.json({ 
      success: true, 
      job,
      created: true,
      message: "Job created successfully"
    });
  } catch (error) {
    logger.error("api/acp/jobs", "Error creating job", { error });
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}
