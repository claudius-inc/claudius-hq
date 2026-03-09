"use client";

import { BarChart3, Heart, Briefcase, DollarSign } from "lucide-react";

interface Campaign {
  engagementLikes?: number | null;
  engagementRetweets?: number | null;
  engagementReplies?: number | null;
  jobsAttributed?: number | null;
  revenueAttributed?: number | null;
  status?: string | null;
}

interface AcpCampaignStatsProps {
  campaigns: Campaign[];
}

export function AcpCampaignStats({ campaigns }: AcpCampaignStatsProps) {
  const postedCampaigns = campaigns.filter(
    (c) => c.status === "posted" || c.status === "analyzed"
  );

  const totalPosts = postedCampaigns.length;
  const totalEngagement = postedCampaigns.reduce(
    (sum, c) =>
      sum +
      (c.engagementLikes ?? 0) +
      (c.engagementRetweets ?? 0) +
      (c.engagementReplies ?? 0),
    0
  );
  const totalJobsAttributed = postedCampaigns.reduce(
    (sum, c) => sum + (c.jobsAttributed ?? 0),
    0
  );
  const totalRevenueAttributed = postedCampaigns.reduce(
    (sum, c) => sum + (c.revenueAttributed ?? 0),
    0
  );

  const stats = [
    {
      label: "Total Posts",
      value: totalPosts.toString(),
      icon: BarChart3,
      color: "text-blue-500",
    },
    {
      label: "Engagement",
      value: totalEngagement.toLocaleString(),
      icon: Heart,
      color: "text-red-400",
    },
    {
      label: "Jobs Attributed",
      value: totalJobsAttributed.toString(),
      icon: Briefcase,
      color: "text-purple-500",
    },
    {
      label: "Revenue",
      value: `$${totalRevenueAttributed.toFixed(2)}`,
      icon: DollarSign,
      color: "text-green-500",
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-4">Campaign Performance</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              <span>{stat.label}</span>
            </div>
            <div className="text-xl font-semibold text-gray-900">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
