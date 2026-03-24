import { db } from "@/db";
import { acpOfferings, marketCache } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHero } from "@/components/PageHero";
import { AcpOfferingsManagement } from "@/components/acp/AcpOfferingsManagement";

// On-demand revalidation when offerings change
export const revalidate = false;

interface OnChainRevenue {
  totalRevenue: number;
  jobCount: number;
  lastUpdated: string | null;
}

async function getOfferingsData() {
  const offerings = await db
    .select()
    .from(acpOfferings)
    .orderBy(desc(acpOfferings.totalRevenue));

  // Get on-chain revenue from cache
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

  return { offerings, onChainRevenue };
}

export default async function AcpOfferingsPage() {
  const { offerings, onChainRevenue } = await getOfferingsData();
  const activeCount = offerings.filter((o) => o.isActive).length;
  const totalCount = offerings.length;

  return (
    <div className="space-y-6">
      <PageHero
        title="ACP Offerings"
        subtitle={`${activeCount} active of ${totalCount} total • ${onChainRevenue.jobCount} jobs • $${onChainRevenue.totalRevenue.toFixed(2)} revenue (on-chain)`}
      />

      <AcpOfferingsManagement 
        initialOfferings={offerings} 
        onChainRevenue={onChainRevenue}
      />
    </div>
  );
}
