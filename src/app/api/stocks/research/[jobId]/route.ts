import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, researchJobs } from "@/db";
import { eq } from "drizzle-orm";
import { isApiAuthenticated } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;

  try {
    const [job] = await db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.id, jobId));

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;

  // Require API auth for updates
  if (!isApiAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { status, progress, error_message, report_id } = body;

    const updateData: Partial<typeof researchJobs.$inferInsert> = {
      updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    };

    if (status !== undefined) updateData.status = status;
    if (progress !== undefined) updateData.progress = progress;
    if (error_message !== undefined) updateData.errorMessage = error_message;
    if (report_id !== undefined) updateData.reportId = report_id;

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    await db.update(researchJobs).set(updateData).where(eq(researchJobs.id, jobId));

    // Purge ISR cache when job status changes
    if (status === "complete" || status === "failed" || status === "processing") {
      revalidatePath("/markets/research");
    }

    // Fetch updated job
    const [job] = await db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.id, jobId));

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
