import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { logger } from "@/lib/logger";
import { getV2AgentInfo } from "@/lib/virtuals-client";

const ACP_DIR = "/root/.openclaw/workspace/skills/acp";
const OFFERINGS_DIR = path.join(ACP_DIR, "src/seller/offerings");

function detectCategory(name: string): string {
  const marketData = [
    "btc_signal", "eth_signal", "fear_greed", "live_price", "technical_signals",
    "market_sentiment", "funding_rate_signal", "portfolio_heat_map", "price_volatility_alert"
  ];
  const utility = ["quick_swap", "gas_tracker", "research_summarizer"];
  const security = ["token_risk_analyzer", "token_safety_quick"];
  const weather = ["weather_now"];
  const entertainment = ["agent_roast"];

  if (marketData.includes(name)) return "market_data";
  if (utility.includes(name)) return "utility";
  if (security.includes(name)) return "security";
  if (weather.includes(name)) return "weather";
  if (entertainment.includes(name)) return "entertainment";
  return "fortune";
}

// GET: Fetch all offerings, overlaying live V2 marketplace state on top of the
// local DB so listed/price/description always reflect what real buyers see.
// The local DB is treated as cold storage for fields the marketplace doesn't
// track (jobCount, totalRevenue, doNotRelist, category).
export async function GET(_req: NextRequest) {
  try {
    const dbOfferings = await db
      .select()
      .from(acpOfferings)
      .orderBy(desc(acpOfferings.isActive), desc(acpOfferings.jobCount));

    let liveOfferings: Awaited<ReturnType<typeof getV2AgentInfo>>["offerings"] = [];
    let liveError: string | null = null;
    try {
      const agent = await getV2AgentInfo();
      liveOfferings = agent.offerings;
    } catch (e) {
      liveError = (e as Error).message;
      logger.warn("api/acp/offerings", `V2 marketplace fetch failed: ${liveError}`);
    }

    const liveByName = new Map(liveOfferings.map((o) => [o.name, o]));
    const dbByName = new Map(dbOfferings.map((o) => [o.name, o]));

    // Merge: union of names, live wins for listed/price/description.
    const allNames = new Set<string>([
      ...Array.from(liveByName.keys()),
      ...Array.from(dbByName.keys()),
    ]);
    const merged = Array.from(allNames).map((name) => {
      const live = liveByName.get(name);
      const local = dbByName.get(name);
      return {
        // Local-only fields (kept from DB)
        id: local?.id,
        category: local?.category,
        jobCount: local?.jobCount ?? 0,
        totalRevenue: local?.totalRevenue ?? 0,
        doNotRelist: local?.doNotRelist ?? 0,
        handlerPath: local?.handlerPath,
        // Marketplace fields — live wins, local is fallback
        name,
        description: live?.description ?? local?.description ?? "",
        price: live?.priceValue ?? local?.price ?? 0,
        listedOnAcp: live ? (live.isHidden ? 0 : 1) : 0,
        isActive: live ? (live.isHidden ? 0 : 1) : (local?.isActive ?? 0),
        requirements: live?.requirements
          ? JSON.stringify(live.requirements)
          : local?.requirements,
        deliverable: live?.deliverable ?? local?.deliverable,
        requiredFunds: live?.requiredFunds ? 1 : (local?.requiredFunds ?? 0),
        slaMinutes: live?.slaMinutes,
        liveOnly: !local && !!live,
        localOnly: !!local && !live,
      };
    });

    // Sort: listed-on-marketplace first, then by jobCount, then alpha.
    merged.sort((a, b) => {
      if (a.listedOnAcp !== b.listedOnAcp) return b.listedOnAcp - a.listedOnAcp;
      if (a.jobCount !== b.jobCount) return b.jobCount - a.jobCount;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      offerings: merged,
      counts: {
        liveOnMarketplace: liveOfferings.filter((o) => !o.isHidden).length,
        hiddenOnMarketplace: liveOfferings.filter((o) => o.isHidden).length,
        localOnly: merged.filter((o) => o.localOnly).length,
        liveOnly: merged.filter((o) => o.liveOnly).length,
        total: merged.length,
      },
      source: liveError
        ? `local DB only (V2 fetch failed: ${liveError})`
        : "merged: V2 marketplace (live truth) + local DB (revenue/category)",
    });
  } catch (error) {
    logger.error("api/acp/offerings", "Error fetching offerings", { error });
    return NextResponse.json({ error: "Failed to fetch offerings" }, { status: 500 });
  }
}

interface OfferingInput {
  name: string;
  description?: string;
  price: number;
  category?: string;
  isActive?: number | boolean;
  handlerPath?: string;
  requirements?: string | Record<string, unknown>;
  deliverable?: string;
  requiredFunds?: number | boolean;
}

interface BulkSyncBody {
  offerings: OfferingInput[];
}

interface CreateOfferingBody {
  name: string;
  description?: string;
  price: number;
  category?: string;
  handlerPath?: string;
  requirements?: string | Record<string, unknown>;
  deliverable?: string;
  requiredFunds?: boolean;
  publish?: boolean;
}

/**
 * POST /api/acp/offerings
 * 
 * Supports two modes:
 * 1. Bulk sync (legacy): { offerings: [...] }
 * 2. Create single offering: { name, description, price, ..., publish? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if this is a bulk sync (legacy mode)
    if (Array.isArray(body.offerings)) {
      return handleBulkSync(body as BulkSyncBody);
    }

    // Otherwise, it's a create/update single offering
    return handleCreateOffering(body as CreateOfferingBody);
  } catch (error) {
    logger.error("api/acp/offerings", "Error processing request", { error });
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}

async function handleBulkSync(body: BulkSyncBody) {
  const { offerings } = body;

  if (!Array.isArray(offerings)) {
    return NextResponse.json({ error: "offerings array required" }, { status: 400 });
  }

  // Upsert each offering
  for (const o of offerings) {
    const existing = await db
      .select()
      .from(acpOfferings)
      .where(eq(acpOfferings.name, o.name))
      .limit(1);

    const isActiveValue = o.isActive === 1 || o.isActive === true ? 1 : 0;
    const requirementsStr = typeof o.requirements === "object"
      ? JSON.stringify(o.requirements)
      : o.requirements;

    if (existing.length > 0) {
      await db
        .update(acpOfferings)
        .set({
          description: o.description,
          price: o.price,
          category: o.category || detectCategory(o.name),
          isActive: isActiveValue,
          handlerPath: o.handlerPath,
          requirements: requirementsStr,
          deliverable: o.deliverable,
          requiredFunds: o.requiredFunds ? 1 : 0,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(acpOfferings.name, o.name));
    } else {
      await db.insert(acpOfferings).values({
        name: o.name,
        description: o.description,
        price: o.price,
        category: o.category || detectCategory(o.name),
        isActive: isActiveValue,
        handlerPath: o.handlerPath,
        requirements: requirementsStr,
        deliverable: o.deliverable,
        requiredFunds: o.requiredFunds ? 1 : 0,
      });
    }
  }

  revalidatePath("/acp");
  return NextResponse.json({ success: true, count: offerings.length });
}

/**
 * PATCH /api/acp/offerings
 * Update specific fields on an offering (e.g., listedOnAcp, price)
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, listedOnAcp, price, description, isActive, jobCount, totalRevenue, doNotRelist, category } = body;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(acpOfferings)
      .where(eq(acpOfferings.name, name))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    
    if (typeof listedOnAcp === "boolean") updates.listedOnAcp = listedOnAcp ? 1 : 0;
    if (typeof price === "number") updates.price = price;
    if (typeof description === "string") updates.description = description;
    if (typeof category === "string") updates.category = category;
    if (typeof isActive === "boolean" || typeof isActive === "number") {
      updates.isActive = isActive ? 1 : 0;
    }
    if (typeof jobCount === "number") updates.jobCount = jobCount;
    if (typeof totalRevenue === "number") updates.totalRevenue = totalRevenue;
    if (typeof doNotRelist === "boolean" || typeof doNotRelist === "number") {
      updates.doNotRelist = doNotRelist ? 1 : 0;
    }

    await db
      .update(acpOfferings)
      .set(updates)
      .where(eq(acpOfferings.name, name));

    revalidatePath("/acp");
    return NextResponse.json({ success: true, name, updated: Object.keys(updates) });
  } catch (error) {
    logger.error("api/acp/offerings", "Error updating offering", { error });
    return NextResponse.json({ error: "Failed to update offering" }, { status: 500 });
  }
}

async function handleCreateOffering(body: CreateOfferingBody) {
  const { name, description, price, category, handlerPath, requirements, deliverable, requiredFunds, publish } = body;

  if (!name || typeof price !== "number") {
    return NextResponse.json(
      { error: "name and price are required" },
      { status: 400 }
    );
  }

  // Check if offering already exists
  const existing = await db
    .select()
    .from(acpOfferings)
    .where(eq(acpOfferings.name, name))
    .limit(1);

  const requirementsStr = typeof requirements === "object"
    ? JSON.stringify(requirements)
    : requirements;

  const offeringData = {
    name,
    description: description || "",
    price,
    category: category || detectCategory(name),
    handlerPath: handlerPath || name,
    requirements: requirementsStr,
    deliverable,
    requiredFunds: requiredFunds ? 1 : 0,
    isActive: 0, // Start inactive until published
    updatedAt: new Date().toISOString(),
  };

  let offeringId: number;

  if (existing.length > 0) {
    await db
      .update(acpOfferings)
      .set(offeringData)
      .where(eq(acpOfferings.name, name));
    offeringId = existing[0].id;
    logger.info("api/acp/offerings", `Updated offering: ${name}`);
  } else {
    const result = await db.insert(acpOfferings).values(offeringData).returning({ id: acpOfferings.id });
    offeringId = result[0].id;
    logger.info("api/acp/offerings", `Created offering: ${name}`);

    // Log decision for new offering
  }

  // Auto-publish if requested
  if (publish) {
    try {
      // Create offering directory and JSON
      const handlerDir = handlerPath || name;
      const offeringDir = path.join(OFFERINGS_DIR, handlerDir);

      if (!fs.existsSync(offeringDir)) {
        fs.mkdirSync(offeringDir, { recursive: true });
      }

      const offeringJson = {
        name,
        description: description || "",
        jobFee: price,
        jobFeeType: "fixed",
        requiredFunds: Boolean(requiredFunds),
        listed: true,
        acpOnly: false,
        ...(requirements && typeof requirements === "object" ? { requirement: requirements } : {}),
        ...(deliverable ? { deliverable } : {}),
      };

      const jsonPath = path.join(offeringDir, "offering.json");
      fs.writeFileSync(jsonPath, JSON.stringify(offeringJson, null, 2));

      // Run acp sell create
      execSync(`cd ${ACP_DIR} && npx tsx bin/acp.ts sell create ${handlerDir} 2>&1`, {
        encoding: "utf-8",
        timeout: 60000,
      });

      // Update isActive
      await db
        .update(acpOfferings)
        .set({ isActive: 1, updatedAt: new Date().toISOString() })
        .where(eq(acpOfferings.id, offeringId));

      // Log decision

      revalidatePath("/acp");
      return NextResponse.json({
        success: true,
        id: offeringId,
        name,
        published: true,
        message: "Created and published successfully",
      });
    } catch (err) {
      const error = err as { message?: string };
      logger.error("api/acp/offerings", `Auto-publish failed: ${error.message || err}`);
      revalidatePath("/acp");
      return NextResponse.json({
        success: true,
        id: offeringId,
        name,
        published: false,
        message: "Created but publish failed",
        publishError: error.message || String(err),
      });
    }
  }

  revalidatePath("/acp");
  return NextResponse.json({
    success: true,
    id: offeringId,
    name,
    published: false,
    message: existing.length > 0 ? "Updated successfully" : "Created successfully",
  });
}
