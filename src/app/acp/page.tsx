import { db } from "@/db";
import { acpOfferings, marketCache } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHero } from "@/components/PageHero";
import { AcpOfferingsManagement } from "./_components/AcpOfferingsManagement";
import { getV2AgentInfo } from "@/lib/virtuals-client";

// On-demand revalidation when offerings change
export const revalidate = false;

interface OnChainRevenue {
  totalRevenue: number;
  jobCount: number;
  lastUpdated: string | null;
}

async function getOfferingsData() {
  // Local DB rows (used for revenue/category fields the marketplace doesn't track).
  const localOfferings = await db
    .select()
    .from(acpOfferings)
    .orderBy(desc(acpOfferings.totalRevenue));

  // Live marketplace state (source of truth for listed/price/description).
  let liveCount = 0;
  let liveTotal = 0;
  try {
    const agent = await getV2AgentInfo();
    liveCount = agent.offerings.filter((o) => !o.isHidden).length;
    liveTotal = agent.offerings.length;
  } catch {
    // V2 unreachable — fall back to local DB counts in the hero.
  }

  // On-chain revenue cache (populated by POST /api/acp/revenue).
  const revenueCache = await db
    .select()
    .from(marketCache)
    .where(eq(marketCache.key, "acp_onchain_revenue"))
    .get();

  let onChainRevenue: OnChainRevenue = {
    totalRevenue: 0,
    jobCount: 0,
    lastUpdated: null,
  };
  if (revenueCache) {
    try {
      const parsed = JSON.parse(revenueCache.data);
      onChainRevenue = {
        totalRevenue: parsed.totalRevenue || 0,
        jobCount: parsed.jobCount || 0,
        lastUpdated: parsed.lastUpdated || null,
      };
    } catch {
      // Ignore parse errors
    }
  }

  return { offerings: localOfferings, onChainRevenue, liveCount, liveTotal };
}

export default async function AcpOfferingsPage() {
  const { offerings, onChainRevenue, liveCount, liveTotal } = await getOfferingsData();

  // Hero: prefer live marketplace counts; fall back to local DB.
  const headlineCount = liveCount || offerings.filter((o) => o.isActive).length;
  const headlineTotal = liveTotal || offerings.length;

  return (
    <div className="space-y-6">
      <PageHero
        title="ACP Offerings"
        subtitle={`${headlineCount} live on marketplace of ${headlineTotal} • ${onChainRevenue.jobCount} jobs • $${onChainRevenue.totalRevenue.toFixed(2)} revenue (on-chain)`}
      />

      <AcpOfferingsManagement
        initialOfferings={offerings}
        onChainRevenue={onChainRevenue}
      />
    </div>
  );
}
