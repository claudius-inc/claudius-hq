import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferings, acpDecisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;
const ACP_DIR = "/root/.openclaw/workspace/skills/acp";
const OFFERINGS_DIR = path.join(ACP_DIR, "src/seller/offerings");

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

interface OfferingJson {
  name: string;
  description: string;
  jobFee: number;
  jobFeeType: string;
  requiredFunds: boolean;
  listed: boolean;
  acpOnly: boolean;
  requirement?: Record<string, { type: string; description: string }>;
  deliverable?: string;
}

/**
 * POST /api/acp/offerings/publish
 * 
 * Publishes an offering from HQ DB to the ACP marketplace:
 * 1. Generates offering.json from DB data
 * 2. Runs `acp sell create {name}`
 * 3. Updates isActive = 1 in DB
 * 4. Logs decision
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

    // Create the offerings directory if it doesn't exist
    const offeringDir = path.join(OFFERINGS_DIR, handlerPath);
    if (!fs.existsSync(offeringDir)) {
      fs.mkdirSync(offeringDir, { recursive: true });
    }

    // Generate offering.json
    const offeringJson: OfferingJson = {
      name: offering.name,
      description: offering.description || "",
      jobFee: offering.price,
      jobFeeType: "fixed",
      requiredFunds: Boolean(offering.requiredFunds),
      listed: true,
      acpOnly: false,
    };

    // Parse requirements if present
    if (offering.requirements) {
      try {
        offeringJson.requirement = JSON.parse(offering.requirements);
      } catch {
        // Keep as empty if invalid JSON
      }
    }

    if (offering.deliverable) {
      offeringJson.deliverable = offering.deliverable;
    }

    // Write offering.json
    const jsonPath = path.join(offeringDir, "offering.json");
    fs.writeFileSync(jsonPath, JSON.stringify(offeringJson, null, 2));
    logger.info("acp/publish", `Wrote offering.json to ${jsonPath}`);

    // Run acp sell create
    let createOutput = "";
    try {
      createOutput = execSync(`cd ${ACP_DIR} && npx tsx bin/acp.ts sell create ${handlerPath} 2>&1`, {
        encoding: "utf-8",
        timeout: 60000,
      });
      logger.info("acp/publish", `acp sell create output: ${createOutput}`);
    } catch (err) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const errorOutput = error.stdout || error.stderr || error.message || String(err);
      logger.error("acp/publish", `acp sell create failed: ${errorOutput}`);
      
      // Log the failed attempt
      await db.insert(acpDecisions).values({
        decisionType: "offering_change",
        offering: offering.name,
        oldValue: "inactive",
        newValue: "publish_failed",
        reasoning: `Publish attempt failed: ${errorOutput.substring(0, 500)}`,
        outcome: "failed",
      });
      
      return NextResponse.json(
        { error: "Failed to publish to marketplace", details: errorOutput },
        { status: 500 }
      );
    }

    // Update isActive in DB
    await db
      .update(acpOfferings)
      .set({
        isActive: 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(acpOfferings.id, offering.id));

    // Log successful decision
    await db.insert(acpDecisions).values({
      decisionType: "offering_change",
      offering: offering.name,
      oldValue: offering.isActive ? "active" : "inactive",
      newValue: "published",
      reasoning: "Published via HQ API",
      outcome: "success",
    });

    return NextResponse.json({
      success: true,
      offering: offering.name,
      message: "Published successfully",
      output: createOutput,
    });
  } catch (error) {
    logger.error("api/acp/offerings/publish", "Error publishing offering", { error });
    return NextResponse.json(
      { error: "Failed to publish offering" },
      { status: 500 }
    );
  }
}
