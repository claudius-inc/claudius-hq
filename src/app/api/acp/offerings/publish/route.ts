import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const API_KEY = process.env.HQ_API_KEY;
const ACP_DIR = "/root/.openclaw/workspace/skills/acp";
const OFFERINGS_DIR = path.join(ACP_DIR, "src/seller/offerings");
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

    // Generate offering.json
    const offeringDir = path.join(OFFERINGS_DIR, offering.handlerPath || offering.name);
    if (!fs.existsSync(offeringDir)) {
      fs.mkdirSync(offeringDir, { recursive: true });
    }

    const offeringJson = {
      name: offering.name,
      description: offering.description || "",
      jobFee: offering.price,
      jobFeeType: "fixed",
      requiredFunds: offering.requiredFunds === 1,
      requirement: offering.requirements ? JSON.parse(offering.requirements) : {},
      deliverable: offering.deliverable || "",
    };

    fs.writeFileSync(
      path.join(offeringDir, "offering.json"),
      JSON.stringify(offeringJson, null, 2)
    );

    // Run acp sell create
    try {
      execSync(`cd ${ACP_DIR} && npx tsx bin/acp.ts sell create ${offering.name}`, {
        encoding: "utf-8",
        timeout: 30000,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return NextResponse.json({ 
        error: `Failed to publish to marketplace: ${error.message}` 
      }, { status: 500 });
    }

    // Update DB
    await db
      .update(acpOfferings)
      .set({ isActive: 1, updatedAt: new Date().toISOString() })
      .where(eq(acpOfferings.id, offering.id));

    return NextResponse.json({ 
      success: true, 
      offering: offering.name,
      price: offering.price,
      activeCount: activeCount + 1,
      maxCount: MAX_OFFERINGS
    });
  } catch (error) {
    console.error("Error publishing offering:", error);
    return NextResponse.json({ error: "Failed to publish offering" }, { status: 500 });
  }
}
