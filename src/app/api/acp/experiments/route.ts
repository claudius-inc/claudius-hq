import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferingExperiments, acpOfferingMetrics } from "@/db/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch all experiments with optional filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const offeringId = searchParams.get("offering_id");
    const includeMetrics = searchParams.get("include_metrics") === "true";

    let query = db.select().from(acpOfferingExperiments);

    const conditions = [];
    if (status) {
      conditions.push(eq(acpOfferingExperiments.status, status));
    }
    if (offeringId) {
      conditions.push(eq(acpOfferingExperiments.offeringId, parseInt(offeringId)));
    }

    const experiments = await db
      .select()
      .from(acpOfferingExperiments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(acpOfferingExperiments.createdAt));

    // Optionally include metrics for each experiment
    if (includeMetrics) {
      const experimentsWithMetrics = await Promise.all(
        experiments.map(async (exp) => {
          if (!exp.offeringId) return { ...exp, metrics: [], totalJobs: 0, totalRevenue: 0 };

          const metrics = await db
            .select()
            .from(acpOfferingMetrics)
            .where(
              and(
                eq(acpOfferingMetrics.offeringId, exp.offeringId),
                gte(acpOfferingMetrics.date, exp.startDate || ""),
                exp.endDate ? lte(acpOfferingMetrics.date, exp.endDate) : sql`1=1`
              )
            )
            .orderBy(desc(acpOfferingMetrics.date));

          const totalJobs = metrics.reduce((sum, m) => sum + (m.jobsCount || 0), 0);
          const totalRevenue = metrics.reduce((sum, m) => sum + (m.revenue || 0), 0);

          return { ...exp, metrics, totalJobs, totalRevenue };
        })
      );

      return NextResponse.json({ experiments: experimentsWithMetrics, total: experimentsWithMetrics.length });
    }

    return NextResponse.json({ experiments, total: experiments.length });
  } catch (error) {
    logger.error("api/acp/experiments", "Error fetching experiments", { error });
    return NextResponse.json({ error: "Failed to fetch experiments" }, { status: 500 });
  }
}

// POST: Create a new experiment
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { offeringId, name, price, description, hypothesis, status, variantLabel, controlOfferingId } = body;

    if (!name || price === undefined) {
      return NextResponse.json({ error: "name and price are required" }, { status: 400 });
    }

    const [experiment] = await db
      .insert(acpOfferingExperiments)
      .values({
        offeringId: offeringId || null,
        name,
        price,
        description: description || null,
        hypothesis: hypothesis || null,
        status: status || "active",
        variantLabel: variantLabel || null,
        controlOfferingId: controlOfferingId || null,
      })
      .returning();

    return NextResponse.json({ success: true, experiment });
  } catch (error) {
    logger.error("api/acp/experiments", "Error creating experiment", { error });
    return NextResponse.json({ error: "Failed to create experiment" }, { status: 500 });
  }
}

// PATCH: Update an experiment
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

    // Map camelCase to snake_case for update
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.offeringId !== undefined) updateData.offeringId = updates.offeringId;
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.price !== undefined) updateData.price = updates.price;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.hypothesis !== undefined) updateData.hypothesis = updates.hypothesis;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.endDate !== undefined) updateData.endDate = updates.endDate;
    if (updates.resultsSummary !== undefined) updateData.resultsSummary = updates.resultsSummary;
    if (updates.variantLabel !== undefined) updateData.variantLabel = updates.variantLabel;

    const [experiment] = await db
      .update(acpOfferingExperiments)
      .set(updateData)
      .where(eq(acpOfferingExperiments.id, id))
      .returning();

    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, experiment });
  } catch (error) {
    logger.error("api/acp/experiments", "Error updating experiment", { error });
    return NextResponse.json({ error: "Failed to update experiment" }, { status: 500 });
  }
}

// DELETE: Delete an experiment
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
      .delete(acpOfferingExperiments)
      .where(eq(acpOfferingExperiments.id, parseInt(id)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    logger.error("api/acp/experiments", "Error deleting experiment", { error });
    return NextResponse.json({ error: "Failed to delete experiment" }, { status: 500 });
  }
}
