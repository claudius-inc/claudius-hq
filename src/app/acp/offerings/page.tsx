import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHero } from "@/components/PageHero";
import { AcpOfferingsManagement } from "@/components/acp/AcpOfferingsManagement";

export const revalidate = 60;

async function getOfferingsData() {
  const offerings = await db
    .select()
    .from(acpOfferings)
    .orderBy(desc(acpOfferings.totalRevenue));

  return { offerings };
}

export default async function AcpOfferingsPage() {
  const { offerings } = await getOfferingsData();
  const activeCount = offerings.filter((o) => o.isActive).length;
  const totalRevenue = offerings.reduce((sum, o) => sum + (o.totalRevenue ?? 0), 0);
  const totalJobs = offerings.reduce((sum, o) => sum + (o.jobCount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHero
        title="ACP Offerings"
        subtitle={`${activeCount}/20 active • ${totalJobs} jobs • $${totalRevenue.toFixed(2)} revenue`}
      />

      <AcpOfferingsManagement initialOfferings={offerings} />
    </div>
  );
}
