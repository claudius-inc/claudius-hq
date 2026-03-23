import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createOffering } from "@/lib/virtuals-client";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;
const MAX_OFFERINGS = 20;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

async function getActiveOfferingsCount(): Promise<number> {
  const result = await db
    .select()
    .from(acpOfferings)
    .where(eq(acpOfferings.isActive, 1));
  return result.length;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, name } = body;

    // Find offering
    let offering;
    if (id) {
      const result = await db.select().from(acpOfferings).where(eq(acpOfferings.id, id)).limit(1);
      offering = result[0];
    } else if (name) {
      const result = await db.select().from(acpOfferings).where(eq(acpOfferings.name, name)).limit(1);
      offering = result[0];
    }

    if (!offering) {
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    if (offering.isActive) {
      return NextResponse.json({ error: "Offering already published" }, { status: 400 });
    }

    // Check max count
    const activeCount = await getActiveOfferingsCount();
    if (activeCount >= MAX_OFFERINGS) {
      return NextResponse.json({ 
        error: `Already at max ${MAX_OFFERINGS} offerings. Unpublish one first.` 
      }, { status: 400 });
    }

    // Parse requirements if stored as JSON string
    let requirements: Record<string, unknown> = {};
    if (offering.requirements) {
      try {
        requirements = JSON.parse(offering.requirements);
      } catch {
        // Keep empty if invalid JSON
      }
    }

    // Call Virtuals API to create offering
    try {
      await createOffering({
        name: offering.name,
        description: offering.description || "",
        priceV2: {
          type: "fixed",
          value: offering.price || 0,
        },
        requiredFunds: offering.requiredFunds === 1,
        requirement: requirements,
        deliverable: offering.deliverable || "",
      });
      
      logger.info("acp/publish", `Published offering: ${offering.name}`);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error("acp/publish", `Failed to publish to Virtuals API: ${error.message}`);
      return NextResponse.json({ 
        error: `Failed to publish to marketplace: ${error.message}` 
      }, { status: 500 });
    }

    // Update DB
    await db
      .update(acpOfferings)
      .set({ 
        isActive: 1, 
        listedOnAcp: 1,
        updatedAt: new Date().toISOString() 
      })
      .where(eq(acpOfferings.id, offering.id));

    return NextResponse.json({ 
      success: true, 
      offering: offering.name,
      price: offering.price,
      activeCount: activeCount + 1,
      maxCount: MAX_OFFERINGS
    });
  } catch (error) {
    logger.error("api/acp/offerings/publish", "Error publishing offering", { error });
    return NextResponse.json({ error: "Failed to publish offering" }, { status: 500 });
  }
}
