import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { researchJobs } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";

// GET: List active research jobs
export async function GET() {
  try {
    const jobs = await db
      .select()
      .from(researchJobs)
      .where(or(eq(researchJobs.status, "pending"), eq(researchJobs.status, "processing")))
      .orderBy(desc(researchJobs.createdAt));

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Error fetching research jobs:", error);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

// POST: Queue new research (simple proxy - actual work done by cron/external)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker } = body;

    if (!ticker) {
      return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
    }

    // Create a new research job
    const jobId = `research-${ticker.toUpperCase()}-${Date.now()}`;
    
    await db.insert(researchJobs).values({
      id: jobId,
      ticker: ticker.toUpperCase(),
      status: "pending",
      progress: 0,
    });

    return NextResponse.json({ 
      success: true, 
      jobId,
      message: `Research queued for ${ticker.toUpperCase()}` 
    });
  } catch (error) {
    console.error("Error creating research job:", error);
    return NextResponse.json({ error: "Failed to queue research" }, { status: 500 });
  }
}
