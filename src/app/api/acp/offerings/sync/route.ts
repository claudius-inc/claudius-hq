/**
 * POST /api/acp/offerings/sync
 * 
 * Syncs offering state from VPS to HQ database.
 * Called by VPS after any offering change (create, delete, job completed).
 * 
 * Body: { offerings: Array<{ name, description, price, isListed, jobCount?, totalRevenue? }> }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

interface OfferingSync {
  name: string;
  description?: string;
  price?: number;
  isListed: boolean;
  jobCount?: number;
  totalRevenue?: number;
  category?: string;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { offerings } = body as { offerings: OfferingSync[] };

    if (!offerings || !Array.isArray(offerings)) {
      return NextResponse.json(
        { error: "offerings array required" },
        { status: 400 }
      );
    }

    const results: { name: string; action: string }[] = [];

    for (const offering of offerings) {
      // Check if offering exists
      const existing = await db
        .select()
        .from(acpOfferings)
        .where(eq(acpOfferings.name, offering.name))
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(acpOfferings)
          .set({
            description: offering.description ?? existing[0].description,
            price: offering.price ?? existing[0].price,
            listedOnAcp: offering.isListed ? 1 : 0,
            isActive: offering.isListed ? 1 : 0,
            jobCount: offering.jobCount ?? existing[0].jobCount,
            totalRevenue: offering.totalRevenue ?? existing[0].totalRevenue,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(acpOfferings.name, offering.name));
        
        results.push({ name: offering.name, action: "updated" });
      } else {
        // Insert new
        await db.insert(acpOfferings).values({
          name: offering.name,
          description: offering.description || "",
          price: offering.price || 0,
          category: offering.category || "utility",
          isActive: offering.isListed ? 1 : 0,
          listedOnAcp: offering.isListed ? 1 : 0,
          jobCount: offering.jobCount || 0,
          totalRevenue: offering.totalRevenue || 0,
          handlerPath: offering.name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        
        results.push({ name: offering.name, action: "created" });
      }
    }

    logger.info("api/acp/offerings/sync", "Synced offerings", { 
      count: offerings.length,
      results 
    });

    return NextResponse.json({ 
      success: true, 
      synced: results.length,
      results 
    });
  } catch (error) {
    logger.error("api/acp/offerings/sync", "Error syncing offerings", { error });
    return NextResponse.json(
      { error: "Failed to sync offerings" },
      { status: 500 }
    );
  }
}
