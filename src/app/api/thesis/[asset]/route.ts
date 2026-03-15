import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { thesisConfigs, thesisDecisionLog } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getThesisEntry, getSupportedAssets, type ThesisRegistryEntry } from "@/lib/thesis/registry";
import { evaluateSignals, evaluatePreCommitments } from "@/lib/thesis/engine";
import { getCache, setCache } from "@/lib/market-cache";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const CACHE_TTL = 300; // 5 minutes

// GET /api/thesis/gold — Evaluate all signals + pre-commitment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;

  try {
    const entry = getThesisEntry(asset);
    if (!entry) {
      return NextResponse.json(
        { error: `Asset "${asset}" not supported. Available: ${getSupportedAssets().join(", ")}` },
        { status: 404 },
      );
    }

    const cacheKey = `thesis:${asset}`;
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<Record<string, unknown>>(cacheKey, CACHE_TTL);
      if (cached && !cached.isStale) {
        return NextResponse.json({ ...cached.data, cached: true });
      }
      if (cached) {
        // Stale — return stale, refresh in background
        evaluateAndCache(asset, entry, cacheKey).catch((e) =>
          logger.error("api/thesis", `Background refresh failed for ${asset}`, { error: e }),
        );
        return NextResponse.json({ ...cached.data, cached: true, isStale: true });
      }
    }

    const data = await evaluateAndCache(asset, entry, cacheKey);
    return NextResponse.json({ ...data, cached: false });
  } catch (e) {
    logger.error("api/thesis", `Thesis evaluation error for ${asset}`, { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function evaluateAndCache(
  asset: string,
  entry: ThesisRegistryEntry,
  cacheKey: string,
) {
  // Check for user overrides in DB
  const dbConfig = await db
    .select()
    .from(thesisConfigs)
    .where(eq(thesisConfigs.asset, asset))
    .limit(1);

  const config = entry.config;
  const resolver = entry.createResolver();

  // Use DB overrides if available
  let entryConditions = config.entryConditions;
  let changeConditions = config.thesisChangeConditions;
  let reviewTriggers = config.reviewTriggers;

  if (dbConfig.length > 0) {
    const row = dbConfig[0];
    if (row.entryConditions) {
      try { entryConditions = JSON.parse(row.entryConditions); } catch { /* use default */ }
    }
    if (row.thesisChangeConditions) {
      try { changeConditions = JSON.parse(row.thesisChangeConditions); } catch { /* use default */ }
    }
    if (row.reviewTriggers) {
      try { reviewTriggers = JSON.parse(row.reviewTriggers); } catch { /* use default */ }
    }
  }

  const snapshot = await evaluateSignals(config.signalDefinitions, resolver);
  const preCommitment = evaluatePreCommitments(
    snapshot.signals,
    entryConditions,
    changeConditions,
    reviewTriggers,
  );

  // Recent decisions
  const recentDecisions = await db
    .select()
    .from(thesisDecisionLog)
    .where(eq(thesisDecisionLog.asset, asset))
    .orderBy(desc(thesisDecisionLog.createdAt))
    .limit(5);

  const data = {
    asset,
    signals: snapshot.signals,
    compositeScore: snapshot.compositeScore,
    compositeRating: snapshot.compositeRating,
    evaluatedAt: snapshot.evaluatedAt,
    preCommitment,
    recentDecisions,
  };

  await setCache(cacheKey, data);
  return data;
}

// POST /api/thesis/gold — Upsert thesis config (edit thresholds)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;

  try {
    const body = await request.json();
    const { entryConditions, thesisChangeConditions, reviewTriggers, notes, status } = body;

    const existing = await db
      .select()
      .from(thesisConfigs)
      .where(eq(thesisConfigs.asset, asset))
      .limit(1);

    const data = {
      asset,
      name: body.name || `${asset.charAt(0).toUpperCase() + asset.slice(1)} Thesis`,
      status: status || "active",
      entryConditions: entryConditions ? JSON.stringify(entryConditions) : null,
      thesisChangeConditions: thesisChangeConditions ? JSON.stringify(thesisChangeConditions) : null,
      reviewTriggers: reviewTriggers ? JSON.stringify(reviewTriggers) : null,
      notes: notes || null,
      updatedAt: new Date().toISOString(),
    };

    if (existing.length > 0) {
      await db
        .update(thesisConfigs)
        .set(data)
        .where(eq(thesisConfigs.asset, asset));
    } else {
      await db.insert(thesisConfigs).values(data);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("api/thesis", `Config update error for ${asset}`, { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
