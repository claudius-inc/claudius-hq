import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import { db } from "@/db";
import { acpState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch current ACP state
export async function GET(_req: NextRequest) {
  if (!checkApiAuth(_req)) return unauthorizedResponse();
  try {
  if (!checkApiAuth(_req)) return unauthorizedResponse();
    const rows = await db.select().from(acpState).where(eq(acpState.id, 1));
    
    if (rows.length === 0) {
      // Return default state if not initialized
      return NextResponse.json({
        state: {
          id: 1,
          currentPillar: "quality",
          currentEpoch: null,
          epochStart: null,
          epochEnd: null,
          jobsThisEpoch: 0,
          revenueThisEpoch: 0,
          targetJobs: null,
          targetRevenue: null,
          targetRank: null,
          serverRunning: 1,
          serverPid: null,
          lastHeartbeat: null,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({ state: rows[0] });
  } catch (error) {
    logger.error("api/acp/state", "Error fetching state", { error });
    return NextResponse.json({ error: "Failed to fetch state" }, { status: 500 });
  }
}

// PATCH: Update ACP state fields
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    
    // Remove id from updates (can't change primary key)
    const { id: _id, ...updates } = body;
    
    // Add updated timestamp
    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Check if state exists, insert if not
    const existing = await db.select().from(acpState).where(eq(acpState.id, 1));
    
    if (existing.length === 0) {
      await db.insert(acpState).values({
        id: 1,
        currentPillar: updateData.currentPillar ?? "quality",
        ...updateData,
      });
    } else {
      await db
        .update(acpState)
        .set(updateData)
        .where(eq(acpState.id, 1));
    }

    const updated = await db.select().from(acpState).where(eq(acpState.id, 1));
    return NextResponse.json({ state: updated[0] });
  } catch (error) {
    logger.error("api/acp/state", "Error updating state", { error });
    return NextResponse.json({ error: "Failed to update state" }, { status: 500 });
  }
}
