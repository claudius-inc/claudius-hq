import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";

export async function POST(request: NextRequest) {
  await ensureDB();

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
    const existing = await db.execute({
      sql: "SELECT id, status FROM research_jobs WHERE ticker = ? AND status IN ('pending', 'processing') LIMIT 1",
      args: [cleanTicker],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({
        jobId: existing.rows[0].id,
        ticker: cleanTicker,
        status: existing.rows[0].status,
        message: "Research already in progress for this ticker.",
      });
    }

    // Generate a job ID and create the job record
    const jobId = `research-${cleanTicker}-${Date.now()}`;
    
    await db.execute({
      sql: `INSERT INTO research_jobs (id, ticker, status, progress, created_at, updated_at) 
            VALUES (?, ?, 'pending', 0, datetime('now'), datetime('now'))`,
      args: [jobId, cleanTicker],
    });

    console.log(`[Research Queue] Ticker: ${cleanTicker}, JobId: ${jobId}`);

    return NextResponse.json({
      jobId,
      ticker: cleanTicker,
      status: "pending",
      message: "Research request queued. Refresh the page to see progress.",
    });
  } catch (error) {
    console.error("[Research API Error]", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  await ensureDB();

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const status = searchParams.get("status");

  try {
    if (jobId) {
      // Get specific job
      const result = await db.execute({
        sql: "SELECT * FROM research_jobs WHERE id = ?",
        args: [jobId],
      });
      
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      
      return NextResponse.json({ job: result.rows[0] });
    }

    // Get all jobs, optionally filtered by status
    let sql = "SELECT * FROM research_jobs";
    const args: string[] = [];
    
    if (status) {
      sql += " WHERE status = ?";
      args.push(status);
    }
    
    sql += " ORDER BY created_at DESC LIMIT 50";
    
    const result = await db.execute({ sql, args });
    return NextResponse.json({ jobs: result.rows });
  } catch (error) {
    console.error("[Research API Error]", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
