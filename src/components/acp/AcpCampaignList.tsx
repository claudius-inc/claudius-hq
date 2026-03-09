"use client";

import { AcpCampaignCard } from "./AcpCampaignCard";

interface Campaign {
  id: number;
  channel?: string | null;
  content: string;
  targetOffering?: string | null;
  status?: string | null;
  scheduledAt?: string | null;
  postedAt?: string | null;
  tweetId?: string | null;
  engagementLikes?: number | null;
  engagementRetweets?: number | null;
  engagementReplies?: number | null;
  jobsAttributed?: number | null;
  revenueAttributed?: number | null;
  createdAt?: string | null;
}

interface AcpCampaignListProps {
  campaigns: Campaign[];
}

export function AcpCampaignList({ campaigns }: AcpCampaignListProps) {
  // Group by status
  const drafts = campaigns.filter((c) => c.status === "draft");
  const scheduled = campaigns.filter((c) => c.status === "scheduled");
  const posted = campaigns.filter(
    (c) => c.status === "posted" || c.status === "analyzed"
  );

  return (
    <div className="space-y-6">
      {/* Drafts */}
      {drafts.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Drafts</h3>
          <div className="space-y-3">
            {drafts.map((c) => (
              <AcpCampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        </div>
      )}

      {/* Scheduled */}
      {scheduled.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Scheduled</h3>
          <div className="space-y-3">
            {scheduled.map((c) => (
              <AcpCampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        </div>
      )}

      {/* Posted */}
      {posted.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Posted</h3>
          <div className="space-y-3">
            {posted.map((c) => (
              <AcpCampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        </div>
      )}

      {campaigns.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          No marketing campaigns yet
        </div>
      )}
    </div>
  );
}
