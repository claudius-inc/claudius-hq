import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpCompetitors, acpCompetitorSnapshots } from "@/db/schema";
import { desc, eq, and, like } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch competitors with optional filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const agentName = searchParams.get("agent_name");
    const isActive = searchParams.get("is_active");
    const includeSnapshots = searchParams.get("include_snapshots") === "true";

    const conditions = [];
    if (category) {
      conditions.push(eq(acpCompetitors.category, category));
    }
    if (agentName) {
      conditions.push(like(acpCompetitors.agentName, `%${agentName}%`));
    }
    if (isActive !== null && isActive !== undefined) {
      conditions.push(eq(acpCompetitors.isActive, isActive === "true" ? 1 : 0));
    }

    const competitors = await db
      .select()
      .from(acpCompetitors)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(acpCompetitors.jobsCount));

    // Optionally include snapshots for each competitor
    if (includeSnapshots) {
      const competitorsWithSnapshots = await Promise.all(
        competitors.map(async (comp) => {
          const snapshots = await db
            .select()
            .from(acpCompetitorSnapshots)
            .where(eq(acpCompetitorSnapshots.competitorId, comp.id))
            .orderBy(desc(acpCompetitorSnapshots.snapshotAt))
            .limit(30);

          const priceHistory = snapshots.map((s) => ({
            date: s.snapshotAt,
            price: s.price,
          }));

          return { ...comp, snapshots, priceHistory };
        })
      );

      return NextResponse.json({ competitors: competitorsWithSnapshots, total: competitorsWithSnapshots.length });
    }

    return NextResponse.json({ competitors, total: competitors.length });
  } catch (error) {
    logger.error("api/acp/competitors", "Error fetching competitors", { error });
    return NextResponse.json({ error: "Failed to fetch competitors" }, { status: 500 });
  }
}

// POST: Create or update a competitor
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { agentName, agentWallet, offeringName, price, description, category, jobsCount, totalRevenue, notes, tags } = body;

    if (!agentName || !offeringName || price === undefined) {
      return NextResponse.json({ error: "agentName, offeringName, and price are required" }, { status: 400 });
    }

    // Check if competitor already exists (by wallet + offering name)
    const existing = agentWallet
      ? await db
          .select()
          .from(acpCompetitors)
          .where(and(eq(acpCompetitors.agentWallet, agentWallet), eq(acpCompetitors.offeringName, offeringName)))
          .limit(1)
      : [];

    if (existing.length > 0) {
      // Update existing and take snapshot if price changed
      const comp = existing[0];
      const priceChanged = comp.price !== price;

      if (priceChanged) {
        // Take snapshot of current state
        await db.insert(acpCompetitorSnapshots).values({
          competitorId: comp.id,
          price: comp.price,
          jobsCount: comp.jobsCount,
          description: comp.description,
        });
      }

      const [updated] = await db
        .update(acpCompetitors)
        .set({
          agentName,
          price,
          description: description ?? comp.description,
          category: category ?? comp.category,
          jobsCount: jobsCount ?? comp.jobsCount,
          totalRevenue: totalRevenue ?? comp.totalRevenue,
          lastChecked: new Date().toISOString(),
          notes: notes ?? comp.notes,
          tags: tags ?? comp.tags,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(acpCompetitors.id, comp.id))
        .returning();

      return NextResponse.json({ success: true, competitor: updated, action: "updated", priceChanged });
    } else {
      // Create new competitor
      const [inserted] = await db
        .insert(acpCompetitors)
        .values({
          agentName,
          agentWallet: agentWallet || null,
          offeringName,
          price,
          description: description || null,
          category: category || null,
          jobsCount: jobsCount || 0,
          totalRevenue: totalRevenue || null,
          notes: notes || null,
          tags: tags || null,
        })
        .returning();

      return NextResponse.json({ success: true, competitor: inserted, action: "created" });
    }
  } catch (error) {
    logger.error("api/acp/competitors", "Error creating/updating competitor", { error });
    return NextResponse.json({ error: "Failed to save competitor" }, { status: 500 });
  }
}

// PATCH: Update a competitor
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

    const existing = await db.select().from(acpCompetitors).where(eq(acpCompetitors.id, id)).limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    const comp = existing[0];
    const priceChanged = updates.price !== undefined && comp.price !== updates.price;

    // Take snapshot if price changed
    if (priceChanged) {
      await db.insert(acpCompetitorSnapshots).values({
        competitorId: comp.id,
        price: comp.price,
        jobsCount: comp.jobsCount,
        description: comp.description,
      });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
    };

    if (updates.agentName !== undefined) updateData.agentName = updates.agentName;
    if (updates.offeringName !== undefined) updateData.offeringName = updates.offeringName;
    if (updates.price !== undefined) updateData.price = updates.price;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.jobsCount !== undefined) updateData.jobsCount = updates.jobsCount;
    if (updates.totalRevenue !== undefined) updateData.totalRevenue = updates.totalRevenue;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.tags !== undefined) updateData.tags = updates.tags;

    const [updated] = await db.update(acpCompetitors).set(updateData).where(eq(acpCompetitors.id, id)).returning();

    return NextResponse.json({ success: true, competitor: updated, priceChanged });
  } catch (error) {
    logger.error("api/acp/competitors", "Error updating competitor", { error });
    return NextResponse.json({ error: "Failed to update competitor" }, { status: 500 });
  }
}

// DELETE: Delete a competitor
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
      .delete(acpCompetitors)
      .where(eq(acpCompetitors.id, parseInt(id)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    logger.error("api/acp/competitors", "Error deleting competitor", { error });
    return NextResponse.json({ error: "Failed to delete competitor" }, { status: 500 });
  }
}
