import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpMarketing } from "@/db/schema";
import { desc } from "drizzle-orm";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch all marketing campaigns
export async function GET() {
  try {
    const campaigns = await db
      .select()
      .from(acpMarketing)
      .orderBy(desc(acpMarketing.createdAt));

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("Error fetching marketing campaigns:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

// POST: Create a new marketing campaign
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { 
      channel, 
      content, 
      targetOffering, 
      status, 
      scheduledAt,
      postedAt,
      tweetId,
      engagementLikes,
      engagementRetweets,
      engagementReplies,
      jobsAttributed,
      revenueAttributed
    } = body;

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const result = await db.insert(acpMarketing).values({
      channel: channel ?? null,
      content,
      targetOffering: targetOffering ?? null,
      status: status ?? "draft",
      scheduledAt: scheduledAt ?? null,
      postedAt: postedAt ?? null,
      tweetId: tweetId ?? null,
      engagementLikes: engagementLikes ?? 0,
      engagementRetweets: engagementRetweets ?? 0,
      engagementReplies: engagementReplies ?? 0,
      jobsAttributed: jobsAttributed ?? 0,
      revenueAttributed: revenueAttributed ?? 0,
    }).returning();

    return NextResponse.json({ campaign: result[0] });
  } catch (error) {
    console.error("Error creating marketing campaign:", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
