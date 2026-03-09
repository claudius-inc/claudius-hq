import { db } from "@/db";
import { acpMarketing } from "@/db/schema";
import { desc } from "drizzle-orm";
import { AcpCampaignList } from "@/components/acp/AcpCampaignList";
import { AcpCampaignStats } from "@/components/acp/AcpCampaignStats";
import { Megaphone } from "lucide-react";

export const revalidate = 60;

async function getMarketingData() {
  const campaigns = await db
    .select()
    .from(acpMarketing)
    .orderBy(desc(acpMarketing.createdAt));

  return { campaigns };
}

export default async function AcpMarketingPage() {
  const { campaigns } = await getMarketingData();
  const postedCount = campaigns.filter(
    (c) => c.status === "posted" || c.status === "analyzed"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-gray-400" />
            Marketing Campaigns
          </h1>
          <p className="text-sm text-gray-500">
            {postedCount} posted, {campaigns.length - postedCount} in progress
          </p>
        </div>
      </div>

      {/* Stats */}
      <AcpCampaignStats campaigns={campaigns} />

      {/* Campaign List */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-4">Recent Campaigns</h3>
        <AcpCampaignList campaigns={campaigns} />
      </div>
    </div>
  );
}
