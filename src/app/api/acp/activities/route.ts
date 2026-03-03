import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { acpActivities, acpOfferings, acpWalletSnapshots } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch activities with optional filters
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const type = searchParams.get("type");

  try {
    let query = db.select().from(acpActivities).orderBy(desc(acpActivities.createdAt)).limit(limit);

    const activities = await query;

    // Filter by type if specified
    const filtered = type ? activities.filter((a) => a.type === type) : activities;

    return NextResponse.json({ activities: filtered });
  } catch (error) {
    console.error("Error fetching ACP activities:", error);
    return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

// POST: Log a new activity
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, jobId, offering, counterparty, amount, details, outcome } = body;

    if (!type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }

    const [activity] = await db
      .insert(acpActivities)
      .values({
        type,
        jobId: jobId || null,
        offering: offering || null,
        counterparty: counterparty || null,
        amount: amount ?? null,
        details: details ? JSON.stringify(details) : null,
        outcome: outcome || "success",
      })
      .returning();

    // If it's a job_completed, update the offering stats
    if (type === "job_completed" && offering && amount) {
      await db
        .update(acpOfferings)
        .set({
          jobCount: sql`${acpOfferings.jobCount} + 1`,
          totalRevenue: sql`${acpOfferings.totalRevenue} + ${amount}`,
          lastJobAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(acpOfferings.name, offering));
    }

    // Invalidate ISR cache for ACP page
    revalidatePath("/acp");

    return NextResponse.json({ success: true, activity });
  } catch (error) {
    console.error("Error logging ACP activity:", error);
    return NextResponse.json({ error: "Failed to log activity" }, { status: 500 });
  }
}
