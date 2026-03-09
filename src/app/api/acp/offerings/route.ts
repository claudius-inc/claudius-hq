import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch all offerings
export async function GET() {
  try {
    const offerings = await db
      .select()
      .from(acpOfferings)
      .orderBy(desc(acpOfferings.jobCount));

    return NextResponse.json({ offerings });
  } catch (error) {
    logger.error("api/acp/offerings", "Error fetching offerings", { error });
    return NextResponse.json({ error: "Failed to fetch offerings" }, { status: 500 });
  }
}

// POST: Sync offerings (replace all)
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { offerings } = body;

    if (!Array.isArray(offerings)) {
      return NextResponse.json({ error: "offerings array required" }, { status: 400 });
    }

    // Upsert each offering
    for (const o of offerings) {
      const existing = await db.select().from(acpOfferings).where(eq(acpOfferings.name, o.name)).limit(1);
      
      if (existing.length > 0) {
        await db
          .update(acpOfferings)
          .set({
            description: o.description,
            price: o.price,
            category: o.category,
            isActive: o.isActive ?? 1,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(acpOfferings.name, o.name));
      } else {
        await db.insert(acpOfferings).values({
          name: o.name,
          description: o.description,
          price: o.price,
          category: o.category,
          isActive: o.isActive ?? 1,
        });
      }
    }

    return NextResponse.json({ success: true, count: offerings.length });
  } catch (error) {
    logger.error("api/acp/offerings", "Error syncing offerings", { error });
    return NextResponse.json({ error: "Failed to sync offerings" }, { status: 500 });
  }
}
