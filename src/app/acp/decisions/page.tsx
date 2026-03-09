import { db } from "@/db";
import { acpDecisions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHero } from "@/components/PageHero";
import { AcpDecisionsList } from "@/components/acp/AcpDecisionsList";

export const revalidate = 60;

async function getDecisionsData() {
  const decisions = await db
    .select()
    .from(acpDecisions)
    .orderBy(desc(acpDecisions.createdAt))
    .limit(100);

  return { decisions };
}

export default async function AcpDecisionsPage() {
  const { decisions } = await getDecisionsData();

  // Count by type
  const typeCounts: Record<string, number> = {};
  for (const d of decisions) {
    const type = d.decisionType ?? "other";
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Decision Log"
        subtitle={`${decisions.length} decisions recorded`}
      />

      {/* Type Summary */}
      {Object.keys(typeCounts).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Decision Types</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(typeCounts).map(([type, count]) => (
              <span
                key={type}
                className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
              >
                {type.replace(/_/g, " ")}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Decisions List */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-4">Decision History</h3>
        <AcpDecisionsList decisions={decisions} />
      </div>
    </div>
  );
}
