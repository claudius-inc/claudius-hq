"use client";

import { Heart, Repeat2, MessageCircle, ExternalLink, Clock, FileText } from "lucide-react";

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

interface AcpCampaignCardProps {
  campaign: Campaign;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600" },
  scheduled: { label: "Scheduled", color: "bg-blue-50 text-blue-700" },
  posted: { label: "Posted", color: "bg-green-50 text-green-700" },
  analyzed: { label: "Analyzed", color: "bg-purple-50 text-purple-700" },
};

export function AcpCampaignCard({ campaign }: AcpCampaignCardProps) {
  const status = statusConfig[campaign.status ?? "draft"] ?? statusConfig.draft;
  const isPosted = campaign.status === "posted" || campaign.status === "analyzed";
  const hasEngagement =
    (campaign.engagementLikes ?? 0) > 0 ||
    (campaign.engagementRetweets ?? 0) > 0 ||
    (campaign.engagementReplies ?? 0) > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs rounded-full ${status.color}`}>
            {status.label}
          </span>
          {campaign.channel && (
            <span className="text-xs text-gray-500">{campaign.channel}</span>
          )}
        </div>
        {campaign.targetOffering && (
          <span className="text-xs text-gray-400">
            Target: {campaign.targetOffering}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="text-sm text-gray-900 mb-3 whitespace-pre-wrap line-clamp-3">
        {campaign.content}
      </div>

      {/* Engagement (for posted) */}
      {isPosted && hasEngagement && (
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
          <span className="flex items-center gap-1">
            <Heart className="w-3.5 h-3.5 text-red-400" />
            {campaign.engagementLikes ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <Repeat2 className="w-3.5 h-3.5 text-green-500" />
            {campaign.engagementRetweets ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5 text-blue-400" />
            {campaign.engagementReplies ?? 0}
          </span>
        </div>
      )}

      {/* Attribution */}
      {isPosted && (campaign.jobsAttributed ?? 0) > 0 && (
        <div className="bg-green-50 rounded px-3 py-2 text-sm mb-3">
          <span className="font-medium text-green-700">Attribution: </span>
          <span className="text-green-600">
            {campaign.jobsAttributed} jobs, ${(campaign.revenueAttributed ?? 0).toFixed(2)} revenue
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-1">
          {campaign.status === "scheduled" && campaign.scheduledAt ? (
            <>
              <Clock className="w-3.5 h-3.5" />
              <span>Scheduled: {new Date(campaign.scheduledAt).toLocaleString()}</span>
            </>
          ) : campaign.postedAt ? (
            <>
              <FileText className="w-3.5 h-3.5" />
              <span>Posted: {new Date(campaign.postedAt).toLocaleDateString()}</span>
            </>
          ) : (
            <span>Created: {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString() : "Unknown"}</span>
          )}
        </div>

        {campaign.tweetId && (
          <a
            href={`https://twitter.com/i/web/status/${campaign.tweetId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
          >
            View
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}
