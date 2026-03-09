import { db } from "@/db";
import { acpOfferings, acpOfferingExperiments } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHero } from "@/components/PageHero";
import { AcpOfferingsTable } from "@/components/acp/AcpOfferingsTable";

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
      <PageHero
        title="Offerings"
        subtitle={`${activeCount} active of ${offerings.length} total (limit: 20)`}
      />

      {/* Table */}
      <AcpOfferingsTable offerings={offerings} experiments={experiments} />
    </div>
  );
}
