import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marketCache } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getV2AgentInfo, getV2WalletAddress } from "@/lib/virtuals-client";
import { logger } from "@/lib/logger";

const REVENUE_CACHE_KEY = "acp_onchain_revenue";

interface CachedRevenue {
  totalRevenue: number;
  jobCount: number;
  transfers: Array<{ date: string; amount: number; tx: string }>;
}

interface JobSummary {
  name: string;
  jobCount: number;
  totalRevenue: number;
}

/**
 * GET /api/acp/jobs
 *
 * Source of truth: cached on-chain transfers (acp_onchain_revenue) for totals,
 * V2 marketplace for per-offering pricing. Per-offering job counts are inferred
 * by matching transfer amounts to offering prices — best-effort, not exact, since
 * the on-chain transfer doesn't carry the offering name.
 *
 * Query params:
 *   - limit: max number of offerings to return (default: 20)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const walletAddress = await getV2WalletAddress();

    // Live offerings list (price + name)
    const agent = await getV2AgentInfo();
    const offerings = agent.offerings.filter((o) => !o.isHidden);

    // Cached revenue (populated by POST /api/acp/revenue)
    const cached = await db
      .select()
      .from(marketCache)
      .where(eq(marketCache.key, REVENUE_CACHE_KEY))
      .get();

    let totalJobs = 0;
    let totalRevenue = 0;
    const perOffering = new Map<string, JobSummary>();

    if (cached) {
      const data = JSON.parse(cached.data) as CachedRevenue;
      totalJobs = data.jobCount;
      totalRevenue = data.totalRevenue;

      // Heuristic: match each transfer amount to the closest offering price (within 1c).
      const priceToOffering = new Map<number, string>();
      for (const o of offerings) {
        priceToOffering.set(Math.round(o.priceValue * 100) / 100, o.name);
      }

      for (const tx of data.transfers) {
        const amt = Math.round(tx.amount * 100) / 100;
        const matched = priceToOffering.get(amt);
        if (!matched) continue;
        const cur = perOffering.get(matched) || { name: matched, jobCount: 0, totalRevenue: 0 };
        cur.jobCount += 1;
        cur.totalRevenue = Math.round((cur.totalRevenue + tx.amount) * 100) / 100;
        perOffering.set(matched, cur);
      }
    }

    const jobs = Array.from(perOffering.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);

    const matched = jobs.reduce((s, j) => s + j.jobCount, 0);
    const unmatched = totalJobs - matched;

    return NextResponse.json({
      walletAddress,
      jobs,
      stats: {
        total: jobs.length,
        totalJobs,
        unmatched, // transfers we couldn't pin to a specific offering by price
        asProvider: totalJobs,
        asClient: 0,
        revenueUsdc: totalRevenue,
        spentUsdc: 0,
      },
      lastUpdated: cached?.updatedAt || null,
      source: "on-chain transfers via /api/acp/revenue cache, offerings via V2 marketplace",
    });
  } catch (err) {
    const error = err as Error;
    logger.error("api/acp/jobs", `Failed to get jobs: ${error.message}`);
    return NextResponse.json(
      { error: "Failed to fetch jobs", details: error.message },
      { status: 500 }
    );
  }
}
