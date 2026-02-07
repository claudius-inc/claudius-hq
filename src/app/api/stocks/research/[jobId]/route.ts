import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  await ensureDB();
  const { jobId } = await params;

  try {
    const result = await db.execute({
      sql: "SELECT * FROM research_jobs WHERE id = ?",
      args: [jobId],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  await ensureDB();
  const { jobId } = await params;

  // Require API auth for updates
  if (!isApiAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { status, progress, error_message, report_id } = body;

    // Build update query dynamically
    const updates: string[] = [];
    const args: (string | number | null)[] = [];

    if (status !== undefined) {
      updates.push("status = ?");
      args.push(status);
    }
    if (progress !== undefined) {
      updates.push("progress = ?");
      args.push(progress);
    }
    if (error_message !== undefined) {
      updates.push("error_message = ?");
      args.push(error_message);
    }
    if (report_id !== undefined) {
      updates.push("report_id = ?");
      args.push(report_id);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    updates.push("updated_at = datetime('now')");
    args.push(jobId);

    await db.execute({
      sql: `UPDATE research_jobs SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    // Fetch updated job
    const result = await db.execute({
      sql: "SELECT * FROM research_jobs WHERE id = ?",
      args: [jobId],
    });

    return NextResponse.json({ job: result.rows[0] });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
