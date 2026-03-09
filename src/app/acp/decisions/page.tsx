import { db } from "@/db";
import { acpDecisions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { AcpDecisionsList } from "@/components/acp/AcpDecisionsList";
import { History } from "lucide-react";

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <History className="w-6 h-6 text-gray-400" />
            Decision Log
          </h1>
          <p className="text-sm text-gray-500">
            {decisions.length} decisions recorded
          </p>
        </div>
      </div>

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
