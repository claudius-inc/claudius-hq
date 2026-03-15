import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpMarketing, ACP_MARKETING_STATUSES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: Fetch a single campaign
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const campaignId = parseInt(id);
    
    if (isNaN(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }

    const campaigns = await db
      .select()
      .from(acpMarketing)
      .where(eq(acpMarketing.id, campaignId))
      .limit(1);

    if (campaigns.length === 0) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign: campaigns[0] });
  } catch (error) {
    logger.error("api/acp/marketing/[id]", "Error fetching campaign", { error });
    return NextResponse.json({ error: "Failed to fetch campaign" }, { status: 500 });
  }
}

// PATCH: Update a campaign
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const campaignId = parseInt(id);
    
    if (isNaN(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }

    const body = await req.json();
    const {
      status,
      content,
      channel,
      targetOffering,
      scheduledAt,
      postedAt,
      tweetId,
      engagementLikes,
      engagementRetweets,
      engagementReplies,
      jobsAttributed,
      revenueAttributed,
    } = body;

    const updates: Record<string, unknown> = {};

    if (status !== undefined) {
      if (!ACP_MARKETING_STATUSES.includes(status)) {
        return NextResponse.json({ 
          error: `Invalid status. Must be one of: ${ACP_MARKETING_STATUSES.join(", ")}` 
        }, { status: 400 });
      }
      updates.status = status;
      
      // Auto-set postedAt when moving to posted
      if (status === "posted" && !postedAt) {
        updates.postedAt = new Date().toISOString();
      }
    }

    if (content !== undefined) updates.content = content;
    if (channel !== undefined) updates.channel = channel;
    if (targetOffering !== undefined) updates.targetOffering = targetOffering;
    if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt;
    if (postedAt !== undefined) updates.postedAt = postedAt;
    if (tweetId !== undefined) updates.tweetId = tweetId;
    if (engagementLikes !== undefined) updates.engagementLikes = engagementLikes;
    if (engagementRetweets !== undefined) updates.engagementRetweets = engagementRetweets;
    if (engagementReplies !== undefined) updates.engagementReplies = engagementReplies;
    if (jobsAttributed !== undefined) updates.jobsAttributed = jobsAttributed;
    if (revenueAttributed !== undefined) updates.revenueAttributed = revenueAttributed;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await db.update(acpMarketing).set(updates).where(eq(acpMarketing.id, campaignId));

    const updated = await db
      .select()
      .from(acpMarketing)
      .where(eq(acpMarketing.id, campaignId))
      .limit(1);

    if (updated.length === 0) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign: updated[0] });
  } catch (error) {
    logger.error("api/acp/marketing/[id]", "Error updating campaign", { error });
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}

// DELETE: Delete a campaign
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const campaignId = parseInt(id);
    
    if (isNaN(campaignId)) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }

    await db.delete(acpMarketing).where(eq(acpMarketing.id, campaignId));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("api/acp/marketing/[id]", "Error deleting campaign", { error });
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
