import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHero } from "@/components/PageHero";
import { AcpOfferingsTable } from "@/components/acp/AcpOfferingsTable";

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

  return (
    <div className="space-y-6">
      <PageHero
        title="Offerings"
        subtitle={`${activeCount} active of ${offerings.length} total`}
      />

      <AcpOfferingsTable offerings={offerings} />
    </div>
  );
}
