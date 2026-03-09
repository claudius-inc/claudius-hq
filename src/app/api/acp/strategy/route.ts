import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpStrategy, ACP_STRATEGY_CATEGORIES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch all strategy params (or by category)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    let query = db.select().from(acpStrategy);

    if (category && ACP_STRATEGY_CATEGORIES.includes(category as typeof ACP_STRATEGY_CATEGORIES[number])) {
      query = query.where(eq(acpStrategy.category, category)) as typeof query;
    }

    const params = await query;

    // Group by category for easier consumption
    const grouped: Record<string, Record<string, unknown>> = {};
    for (const p of params) {
      const cat = p.category ?? "uncategorized";
      if (!grouped[cat]) grouped[cat] = {};
      
      // Try to parse JSON values
      let value: unknown = p.value;
      if (p.value) {
        try {
          value = JSON.parse(p.value);
        } catch {
          // Keep as string if not valid JSON
        }
      }
      grouped[cat][p.key] = value;
    }

    return NextResponse.json({ 
      params,
      grouped,
    });
  } catch (error) {
    logger.error("api/acp/strategy", "Error fetching strategy params", { error });
    return NextResponse.json({ error: "Failed to fetch strategy params" }, { status: 500 });
  }
}

// PUT: Upsert strategy params
export async function PUT(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { params } = body;

    if (!Array.isArray(params)) {
      return NextResponse.json({ 
        error: "params array required with objects containing: id, category, key, value" 
      }, { status: 400 });
    }

    const results = [];

    for (const p of params) {
      const { id, category, key, value, notes } = p;

      if (!id || !key) {
        results.push({ error: "id and key are required", param: p });
        continue;
      }

      // Serialize value if it's an object
      const serializedValue = typeof value === "object" ? JSON.stringify(value) : value;

      const existing = await db.select().from(acpStrategy).where(eq(acpStrategy.id, id)).limit(1);

      if (existing.length > 0) {
        await db
          .update(acpStrategy)
          .set({
            category: category ?? existing[0].category,
            key,
            value: serializedValue,
            notes: notes ?? existing[0].notes,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(acpStrategy.id, id));
      } else {
        await db.insert(acpStrategy).values({
          id,
          category: category ?? null,
          key,
          value: serializedValue,
          notes: notes ?? null,
        });
      }

      results.push({ id, success: true });
    }

    return NextResponse.json({ results });
  } catch (error) {
    logger.error("api/acp/strategy", "Error updating strategy params", { error });
    return NextResponse.json({ error: "Failed to update strategy params" }, { status: 500 });
  }
}

// POST: Create a single strategy param (convenience endpoint)
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, category, key, value, notes } = body;

    if (!id || !key) {
      return NextResponse.json({ error: "id and key are required" }, { status: 400 });
    }

    // Check if already exists
    const existing = await db.select().from(acpStrategy).where(eq(acpStrategy.id, id)).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "Strategy param already exists. Use PUT to update." }, { status: 409 });
    }

    const serializedValue = typeof value === "object" ? JSON.stringify(value) : value;

    const result = await db.insert(acpStrategy).values({
      id,
      category: category ?? null,
      key,
      value: serializedValue,
      notes: notes ?? null,
    }).returning();

    return NextResponse.json({ param: result[0] }, { status: 201 });
  } catch (error) {
    logger.error("api/acp/strategy", "Error creating strategy param", { error });
    return NextResponse.json({ error: "Failed to create strategy param" }, { status: 500 });
  }
}

// DELETE: Remove a strategy param
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param required" }, { status: 400 });
    }

    await db.delete(acpStrategy).where(eq(acpStrategy.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("api/acp/strategy", "Error deleting strategy param", { error });
    return NextResponse.json({ error: "Failed to delete strategy param" }, { status: 500 });
  }
}
