import { db } from "@/db";
import { acpCompetitors } from "@/db/schema";
import { desc } from "drizzle-orm";
import { AcpCompetitorsTable } from "@/components/acp/AcpCompetitorsTable";
import { AcpMarketGaps } from "@/components/acp/AcpMarketGaps";
import { Users } from "lucide-react";

export const revalidate = 60;

async function getCompetitorsData() {
  const competitors = await db
    .select()
    .from(acpCompetitors)
    .orderBy(desc(acpCompetitors.jobsCount));

  // Analyze market gaps (simplified - in real app would be more sophisticated)
  const categoryCounts: Record<string, number> = {};
  for (const c of competitors) {
    const cat = c.category ?? "uncategorized";
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  const gaps = Object.entries(categoryCounts)
    .filter(([, count]) => count <= 2)
    .map(([category, count]) => ({
      category,
      description:
        count === 0
          ? "No competitors in this category"
          : `Only ${count} competitor${count !== 1 ? "s" : ""} - potential opportunity`,
      competitorCount: count,
      opportunity: count === 0 ? "high" : count === 1 ? "medium" : "low",
    })) as { category: string; description: string; competitorCount: number; opportunity: "high" | "medium" | "low" }[];

  return { competitors, gaps };
}

export default async function AcpCompetitorsPage() {
  const { competitors, gaps } = await getCompetitorsData();
  const activeCount = competitors.filter((c) => c.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-gray-400" />
            Competitor Intelligence
          </h1>
          <p className="text-sm text-gray-500">
            Tracking {activeCount} active competitors
          </p>
        </div>
      </div>

      {/* Market Gaps */}
      {gaps.length > 0 && <AcpMarketGaps gaps={gaps} />}

      {/* Competitors Table */}
      <AcpCompetitorsTable competitors={competitors} />
    </div>
  );
}
