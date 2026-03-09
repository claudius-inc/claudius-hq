import { db } from "@/db";
import { acpOfferings, acpOfferingExperiments } from "@/db/schema";
import { desc } from "drizzle-orm";
import { AcpOfferingsTable } from "@/components/acp/AcpOfferingsTable";
import { Package } from "lucide-react";

export const revalidate = 60;

async function getOfferingsData() {
  const [offerings, experiments] = await Promise.all([
    db.select().from(acpOfferings).orderBy(desc(acpOfferings.totalRevenue)),
    db.select().from(acpOfferingExperiments),
  ]);

  return { offerings, experiments };
}

export default async function AcpOfferingsPage() {
  const { offerings, experiments } = await getOfferingsData();
  const activeCount = offerings.filter((o) => o.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-gray-400" />
            Offerings
          </h1>
          <p className="text-sm text-gray-500">
            {activeCount} active of {offerings.length} total (limit: 20)
          </p>
        </div>
      </div>

      {/* Table */}
      <AcpOfferingsTable offerings={offerings} experiments={experiments} />
    </div>
  );
}
