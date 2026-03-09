import { db } from "@/db";
import { acpStrategy } from "@/db/schema";
import { AcpStrategySection } from "@/components/acp/AcpStrategySection";
import { Settings } from "lucide-react";

export const revalidate = 60;

async function getStrategyData() {
  const params = await db.select().from(acpStrategy);

  // Group by category
  const grouped: Record<string, typeof params> = {};
  for (const param of params) {
    const cat = param.category ?? "uncategorized";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(param);
  }

  return { grouped };
}

const categoryOrder = ["pricing", "offerings", "marketing", "experiments", "goals", "uncategorized"];

export default async function AcpStrategyPage() {
  const { grouped } = await getStrategyData();

  // Sort categories
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const aIdx = categoryOrder.indexOf(a);
    const bIdx = categoryOrder.indexOf(b);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  const totalParams = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-gray-400" />
            Strategy Parameters
          </h1>
          <p className="text-sm text-gray-500">
            {totalParams} parameters across {sortedCategories.length} categories
          </p>
        </div>
      </div>

      {/* Strategy Sections */}
      {sortedCategories.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          No strategy parameters configured yet
        </div>
      ) : (
        <div className="space-y-4">
          {sortedCategories.map((category) => (
            <AcpStrategySection
              key={category}
              category={category}
              params={grouped[category]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
