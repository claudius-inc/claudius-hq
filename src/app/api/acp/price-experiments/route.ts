import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import { db } from "@/db";
import { acpPriceExperiments, acpOfferings } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch price experiments with optional filters
export async function GET(req: NextRequest) {
  if (!checkApiAuth(req)) return unauthorizedResponse();
  try {
  if (!checkApiAuth(req)) return unauthorizedResponse();
    const { searchParams } = new URL(req.url);
    const offeringId = searchParams.get("offering_id");
    const status = searchParams.get("status");

    const conditions = [];
    if (offeringId) {
      conditions.push(eq(acpPriceExperiments.offeringId, parseInt(offeringId)));
    }
    if (status) {
      conditions.push(eq(acpPriceExperiments.status, status));
    }

    const priceExperiments = await db
      .select()
      .from(acpPriceExperiments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(acpPriceExperiments.changedAt));

    return NextResponse.json({ priceExperiments });
  } catch (error) {
    logger.error("api/acp/price-experiments", "Error fetching price experiments", { error });
    return NextResponse.json({ error: "Failed to fetch price experiments" }, { status: 500 });
  }
}

// POST: Record a new price change
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { offeringId, oldPrice, newPrice, reason } = body;

    if (!offeringId || oldPrice === undefined || newPrice === undefined) {
      return NextResponse.json({ error: "offeringId, oldPrice, and newPrice are required" }, { status: 400 });
    }

    // Verify offering exists
    const [offering] = await db.select().from(acpOfferings).where(eq(acpOfferings.id, offeringId)).limit(1);

    if (!offering) {
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    const [experiment] = await db
      .insert(acpPriceExperiments)
      .values({
        offeringId,
        oldPrice,
        newPrice,
        reason: reason || null,
        status: "measuring",
      })
      .returning();

    return NextResponse.json({ success: true, priceExperiment: experiment });
  } catch (error) {
    logger.error("api/acp/price-experiments", "Error recording price change", { error });
    return NextResponse.json({ error: "Failed to record price change" }, { status: 500 });
  }
}

// PATCH: Update a price experiment with results
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    if (updates.jobsBefore7d !== undefined) updateData.jobsBefore7d = updates.jobsBefore7d;
    if (updates.jobsAfter7d !== undefined) updateData.jobsAfter7d = updates.jobsAfter7d;
    if (updates.revenueBefore7d !== undefined) updateData.revenueBefore7d = updates.revenueBefore7d;
    if (updates.revenueAfter7d !== undefined) updateData.revenueAfter7d = updates.revenueAfter7d;
    if (updates.revenueDelta !== undefined) updateData.revenueDelta = updates.revenueDelta;
    if (updates.conversionBefore !== undefined) updateData.conversionBefore = updates.conversionBefore;
    if (updates.conversionAfter !== undefined) updateData.conversionAfter = updates.conversionAfter;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.evaluationDate !== undefined) updateData.evaluationDate = updates.evaluationDate;
    if (updates.notes !== undefined) updateData.notes = updates.notes;

    // Auto-calculate revenueDelta if before/after provided
    if (updates.revenueAfter7d !== undefined && updates.revenueBefore7d !== undefined) {
      updateData.revenueDelta = updates.revenueAfter7d - updates.revenueBefore7d;
    }

    const [updated] = await db
      .update(acpPriceExperiments)
      .set(updateData)
      .where(eq(acpPriceExperiments.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Price experiment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, priceExperiment: updated });
  } catch (error) {
    logger.error("api/acp/price-experiments", "Error updating price experiment", { error });
    return NextResponse.json({ error: "Failed to update price experiment" }, { status: 500 });
  }
}

// DELETE: Delete a price experiment
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(acpPriceExperiments)
      .where(eq(acpPriceExperiments.id, parseInt(id)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Price experiment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    logger.error("api/acp/price-experiments", "Error deleting price experiment", { error });
    return NextResponse.json({ error: "Failed to delete price experiment" }, { status: 500 });
  }
}
