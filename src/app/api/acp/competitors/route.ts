import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpCompetitors, acpCompetitorSnapshots } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

/**
 * GET /api/acp/competitors
 * Fetch competitor analysis data
 * 
 * Query params:
 *   - category: filter by category
 *   - active: filter by active status (1/0)
 *   - limit: max results (default 50)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const active = searchParams.get("active");
    const limit = parseInt(searchParams.get("limit") || "50");

    let query = db.select().from(acpCompetitors);

    // Build conditions
    const conditions = [];
    if (category) {
      conditions.push(eq(acpCompetitors.category, category));
    }
    if (active !== null) {
      conditions.push(eq(acpCompetitors.isActive, active === "1" ? 1 : 0));
    }

    const competitors = await db
      .select()
      .from(acpCompetitors)
      .orderBy(desc(acpCompetitors.jobsCount))
      .limit(limit);

    // Get unique categories for filtering
    const categories = Array.from(new Set(competitors.map(c => c.category).filter(Boolean)));

    return NextResponse.json({
      competitors,
      categories,
      total: competitors.length,
    });
  } catch (error) {
    logger.error("api/acp/competitors", "Error fetching competitors", { error });
    return NextResponse.json({ error: "Failed to fetch competitors" }, { status: 500 });
  }
}

interface CompetitorInput {
  agentName: string;
  agentWallet?: string;
  offeringName: string;
  price: number;
  description?: string;
  category?: string;
  jobsCount?: number;
  totalRevenue?: number;
  notes?: string;
  tags?: string;
}

/**
 * POST /api/acp/competitors
 * Add or update competitor data
 * 
 * Body: single competitor or { competitors: [...] } for bulk
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const competitors: CompetitorInput[] = Array.isArray(body.competitors) 
      ? body.competitors 
      : [body];

    let created = 0;
    let updated = 0;

    for (const c of competitors) {
      if (!c.agentName || !c.offeringName || typeof c.price !== "number") {
        continue; // Skip invalid entries
      }

      // Check if exists (by agent + offering name)
      const existing = await db
        .select()
        .from(acpCompetitors)
        .where(and(
          eq(acpCompetitors.agentName, c.agentName),
          eq(acpCompetitors.offeringName, c.offeringName)
        ))
        .limit(1);

      if (existing.length > 0) {
        // Update
        await db
          .update(acpCompetitors)
          .set({
            price: c.price,
            description: c.description,
            category: c.category,
            jobsCount: c.jobsCount,
            totalRevenue: c.totalRevenue,
            notes: c.notes,
            tags: c.tags,
            lastChecked: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(acpCompetitors.id, existing[0].id));

        // Add snapshot
        await db.insert(acpCompetitorSnapshots).values({
          competitorId: existing[0].id,
          price: c.price,
          jobsCount: c.jobsCount || 0,
          description: c.description,
        });

        updated++;
      } else {
        // Create
        const result = await db.insert(acpCompetitors).values({
          agentName: c.agentName,
          agentWallet: c.agentWallet,
          offeringName: c.offeringName,
          price: c.price,
          description: c.description,
          category: c.category,
          jobsCount: c.jobsCount || 0,
          totalRevenue: c.totalRevenue,
          notes: c.notes,
          tags: c.tags,
        }).returning({ id: acpCompetitors.id });

        // Add initial snapshot
        await db.insert(acpCompetitorSnapshots).values({
          competitorId: result[0].id,
          price: c.price,
          jobsCount: c.jobsCount || 0,
          description: c.description,
        });

        created++;
      }
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
      total: created + updated,
    });
  } catch (error) {
    logger.error("api/acp/competitors", "Error saving competitors", { error });
    return NextResponse.json({ error: "Failed to save competitors" }, { status: 500 });
  }
}

/**
 * DELETE /api/acp/competitors
 * Remove a competitor
 * 
 * Body: { id } or { agentName, offeringName }
 */
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, agentName, offeringName } = body;

    if (id) {
      await db.delete(acpCompetitors).where(eq(acpCompetitors.id, id));
    } else if (agentName && offeringName) {
      await db
        .delete(acpCompetitors)
        .where(and(
          eq(acpCompetitors.agentName, agentName),
          eq(acpCompetitors.offeringName, offeringName)
        ));
    } else {
      return NextResponse.json({ error: "id or agentName+offeringName required" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("api/acp/competitors", "Error deleting competitor", { error });
    return NextResponse.json({ error: "Failed to delete competitor" }, { status: 500 });
  }
}
