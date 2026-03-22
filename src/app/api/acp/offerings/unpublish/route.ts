import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferings, acpDecisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { execSync } from "child_process";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;
const ACP_DIR = "/root/.openclaw/workspace/skills/acp";

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
 * 1. Runs `acp sell delete {name}`
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
    const handlerPath = offering.handlerPath || offering.name;

    // Run acp sell delete
    let deleteOutput = "";
    try {
      deleteOutput = execSync(`cd ${ACP_DIR} && npx tsx bin/acp.ts sell delete ${handlerPath} 2>&1`, {
        encoding: "utf-8",
        timeout: 60000,
      });
      logger.info("acp/unpublish", `acp sell delete output: ${deleteOutput}`);
    } catch (err) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const errorOutput = error.stdout || error.stderr || error.message || String(err);
      logger.error("acp/unpublish", `acp sell delete failed: ${errorOutput}`);
      
      // Check if it's "not listed" error - that's actually okay
      if (errorOutput.includes("not listed") || errorOutput.includes("Not listed")) {
        logger.info("acp/unpublish", "Offering was not listed, marking as inactive anyway");
      } else {
        // Log the failed attempt
        await db.insert(acpDecisions).values({
          decisionType: "offering_change",
          offering: offering.name,
          oldValue: "active",
          newValue: "unpublish_failed",
          reasoning: `Unpublish attempt failed: ${errorOutput.substring(0, 500)}`,
          outcome: "failed",
        });
        
        return NextResponse.json(
          { error: "Failed to unpublish from marketplace", details: errorOutput },
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

    // Log successful decision
    await db.insert(acpDecisions).values({
      decisionType: "offering_change",
      offering: offering.name,
      oldValue: offering.isActive ? "active" : "inactive",
      newValue: "unpublished",
      reasoning: "Unpublished via HQ API",
      outcome: "success",
    });

    return NextResponse.json({
      success: true,
      offering: offering.name,
      message: "Unpublished successfully",
      output: deleteOutput,
    });
  } catch (error) {
    logger.error("api/acp/offerings/unpublish", "Error unpublishing offering", { error });
    return NextResponse.json(
      { error: "Failed to unpublish offering" },
      { status: 500 }
    );
  }
}
