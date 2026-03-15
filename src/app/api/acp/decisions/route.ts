import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import { db } from "@/db";
import { acpDecisions, ACP_DECISION_TYPES } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch recent decisions
export async function GET(req: NextRequest) {
  if (!checkApiAuth(req)) return unauthorizedResponse();
  try {
  if (!checkApiAuth(req)) return unauthorizedResponse();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const type = searchParams.get("type");
    const offering = searchParams.get("offering");

    let query = db.select().from(acpDecisions);

    // Apply filters
    if (type && ACP_DECISION_TYPES.includes(type as typeof ACP_DECISION_TYPES[number])) {
      query = query.where(eq(acpDecisions.decisionType, type)) as typeof query;
    }
    if (offering) {
      query = query.where(eq(acpDecisions.offering, offering)) as typeof query;
    }

    const decisions = await query
      .orderBy(desc(acpDecisions.createdAt))
      .limit(limit);

    return NextResponse.json({ decisions });
  } catch (error) {
    logger.error("api/acp/decisions", "Error fetching decisions", { error });
    return NextResponse.json({ error: "Failed to fetch decisions" }, { status: 500 });
  }
}

// POST: Log a new decision
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { decisionType, offering, oldValue, newValue, reasoning, outcome } = body;

    if (!decisionType || !reasoning) {
      return NextResponse.json({ 
        error: "decisionType and reasoning are required" 
      }, { status: 400 });
    }

    if (!ACP_DECISION_TYPES.includes(decisionType)) {
      return NextResponse.json({ 
        error: `Invalid decisionType. Must be one of: ${ACP_DECISION_TYPES.join(", ")}` 
      }, { status: 400 });
    }

    const result = await db.insert(acpDecisions).values({
      decisionType,
      offering: offering ?? null,
      oldValue: typeof oldValue === "object" ? JSON.stringify(oldValue) : oldValue ?? null,
      newValue: typeof newValue === "object" ? JSON.stringify(newValue) : newValue ?? null,
      reasoning,
      outcome: outcome ?? null,
    }).returning();

    return NextResponse.json({ decision: result[0] }, { status: 201 });
  } catch (error) {
    logger.error("api/acp/decisions", "Error logging decision", { error });
    return NextResponse.json({ error: "Failed to log decision" }, { status: 500 });
  }
}

// PATCH: Update a decision (mainly to add outcome after the fact)
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, outcome } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (outcome !== undefined) updates.outcome = outcome;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await db.update(acpDecisions).set(updates).where(eq(acpDecisions.id, id));

    const updated = await db
      .select()
      .from(acpDecisions)
      .where(eq(acpDecisions.id, id))
      .limit(1);

    if (updated.length === 0) {
      return NextResponse.json({ error: "Decision not found" }, { status: 404 });
    }

    return NextResponse.json({ decision: updated[0] });
  } catch (error) {
    logger.error("api/acp/decisions", "Error updating decision", { error });
    return NextResponse.json({ error: "Failed to update decision" }, { status: 500 });
  }
}
