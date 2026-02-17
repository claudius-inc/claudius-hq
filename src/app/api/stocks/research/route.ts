import { NextRequest, NextResponse } from "next/server";
import { db, researchJobs } from "@/db";
import { eq, desc } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "anonymous";
  const { success } = limiter.check(5, ip);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { ticker } = body;

    if (!ticker || typeof ticker !== "string") {
      return NextResponse.json(
        { error: "Ticker is required" },
        { status: 400 }
      );
    }

    const cleanTicker = ticker.toUpperCase().trim();

    // Validate ticker format (basic check)
    if (!/^[A-Z0-9.]{1,10}$/.test(cleanTicker)) {
      return NextResponse.json(
        { error: "Invalid ticker format" },
        { status: 400 }
      );
    }

    // Check if there's already a pending/processing job for this ticker
    const [existing] = await db
      .select({ id: researchJobs.id, status: researchJobs.status })
      .from(researchJobs)
      .where(eq(researchJobs.ticker, cleanTicker))
      .limit(1);

    if (
      existing &&
      (existing.status === "pending" || existing.status === "processing")
    ) {
      return NextResponse.json({
        jobId: existing.id,
        ticker: cleanTicker,
        status: existing.status,
        message: "Research already in progress for this ticker.",
      });
    }

    // Generate a job ID and create the job record
    const jobId = `research-${cleanTicker}-${Date.now()}`;

    await db.insert(researchJobs).values({
      id: jobId,
      ticker: cleanTicker,
      status: "pending",
      progress: 0,
    });

    console.log(`[Research Queue] Ticker: ${cleanTicker}, JobId: ${jobId}`);

    // Job is now queued. OpenClaw cron polls for pending jobs and spawns sub-agents.
    // No direct gateway call needed — polling is more reliable.

    return NextResponse.json({
      jobId,
      ticker: cleanTicker,
      status: "pending",
      message: "Research queued. Typically starts within 2 minutes.",
    });
  } catch (error) {
    console.error("[Research API Error]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const status = searchParams.get("status");

  try {
    if (jobId) {
      const [job] = await db
        .select()
        .from(researchJobs)
        .where(eq(researchJobs.id, jobId));

      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      return NextResponse.json({ job });
    }

    let jobs;
    if (status) {
      jobs = await db
        .select()
        .from(researchJobs)
        .where(eq(researchJobs.status, status))
        .orderBy(desc(researchJobs.createdAt))
        .limit(50);
    } else {
      jobs = await db
        .select()
        .from(researchJobs)
        .orderBy(desc(researchJobs.createdAt))
        .limit(50);
    }

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("[Research API Error]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
