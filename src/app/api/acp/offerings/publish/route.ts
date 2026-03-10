import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferings, acpDecisions, acpStrategy } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const API_KEY = process.env.HQ_API_KEY;
const ACP_DIR = "/root/.openclaw/workspace/skills/acp";
const OFFERINGS_DIR = path.join(ACP_DIR, "src/seller/offerings");

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

async function getStrategyValue(category: string, key: string): Promise<string | null> {
  const result = await db
    .select()
    .from(acpStrategy)
    .where(and(eq(acpStrategy.category, category), eq(acpStrategy.key, key)))
    .limit(1);
  return result[0]?.value ?? null;
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

    // ===== ENFORCE STRATEGY =====
    
    // 1. Check price bounds
    const minPrice = parseFloat(await getStrategyValue("pricing", "min_price") || "0");
    const maxPrice = parseFloat(await getStrategyValue("pricing", "max_price") || "1000");
    
    if (offering.price < minPrice) {
      return NextResponse.json({ 
        error: `Price $${offering.price} is below minimum $${minPrice}. Update price first.` 
      }, { status: 400 });
    }
    
    if (offering.price > maxPrice) {
      return NextResponse.json({ 
        error: `Price $${offering.price} exceeds maximum $${maxPrice}. Update price first.` 
      }, { status: 400 });
    }

    // 2. Check max count
    const maxCount = parseInt(await getStrategyValue("offerings", "max_count") || "20");
    const activeCount = await getActiveOfferingsCount();
    
    if (activeCount >= maxCount) {
      return NextResponse.json({ 
        error: `Already at max ${maxCount} offerings. Unpublish one first.` 
      }, { status: 400 });
    }

    // ===== GENERATE & PUBLISH =====

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

    // Log decision
    await db.insert(acpDecisions).values({
      decisionType: "offering_change",
      offering: offering.name,
      newValue: "published",
      reasoning: `Published ${offering.name} at $${offering.price}`,
    });

    return NextResponse.json({ 
      success: true, 
      offering: offering.name,
      price: offering.price,
      activeCount: activeCount + 1,
      maxCount
    });
  } catch (error) {
    console.error("Error publishing offering:", error);
    return NextResponse.json({ error: "Failed to publish offering" }, { status: 500 });
  }
}
