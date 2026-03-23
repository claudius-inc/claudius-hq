import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deleteOffering } from "@/lib/virtuals-client";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

/**
 * POST /api/acp/offerings/unpublish
 * 
 * Unpublishes an offering from the ACP marketplace:
 * 1. Calls Virtuals API to delete offering
 * 2. Updates isActive = 0 in DB
 * 3. Logs decision
 * 
 * Body: { id: number } or { name: string }
 */
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, name } = body;

    if (!id && !name) {
      return NextResponse.json(
        { error: "Either id or name required" },
        { status: 400 }
      );
    }

    // Fetch the offering from DB
    const offerings = await db
      .select()
      .from(acpOfferings)
      .where(id ? eq(acpOfferings.id, id) : eq(acpOfferings.name, name))
      .limit(1);

    if (offerings.length === 0) {
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    const offering = offerings[0];
    const offeringName = offering.handlerPath || offering.name;

    // Call Virtuals API to delete offering
    try {
      await deleteOffering(offeringName);
      logger.info("acp/unpublish", `Deleted offering from Virtuals: ${offeringName}`);
    } catch (err) {
      const error = err as Error;
      const errorMessage = error.message || String(err);
      
      // Check if it's "not listed" error - that's actually okay
      if (errorMessage.includes("not listed") || errorMessage.includes("Not listed") || errorMessage.includes("404")) {
        logger.info("acp/unpublish", "Offering was not listed, marking as inactive anyway");
      } else {
        logger.error("acp/unpublish", `Failed to delete from Virtuals API: ${errorMessage}`);
        return NextResponse.json(
          { error: "Failed to unpublish from marketplace", details: errorMessage },
          { status: 500 }
        );
      }
    }

    // Update isActive and set doNotRelist to prevent auto-relist
    await db
      .update(acpOfferings)
      .set({
        isActive: 0,
        listedOnAcp: 0,
        doNotRelist: 1, // Prevent automation from re-listing this offering
        updatedAt: new Date().toISOString(),
      })
      .where(eq(acpOfferings.id, offering.id));

    return NextResponse.json({
      success: true,
      offering: offering.name,
      message: "Unpublished successfully",
    });
  } catch (error) {
    logger.error("api/acp/offerings/unpublish", "Error unpublishing offering", { error });
    return NextResponse.json(
      { error: "Failed to unpublish offering" },
      { status: 500 }
    );
  }
}
