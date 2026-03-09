import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpMarketing, ACP_MARKETING_STATUSES } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch marketing campaigns
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const status = searchParams.get("status");
    const channel = searchParams.get("channel");

    let query = db.select().from(acpMarketing);

    if (status && ACP_MARKETING_STATUSES.includes(status as typeof ACP_MARKETING_STATUSES[number])) {
      query = query.where(eq(acpMarketing.status, status)) as typeof query;
    }
    if (channel) {
      query = query.where(eq(acpMarketing.channel, channel)) as typeof query;
    }

    const campaigns = await query
      .orderBy(desc(acpMarketing.createdAt))
      .limit(limit);

    return NextResponse.json({ campaigns });
  } catch (error) {
    logger.error("api/acp/marketing", "Error fetching campaigns", { error });
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
    const { channel, content, targetOffering, status, scheduledAt } = body;

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const result = await db.insert(acpMarketing).values({
      channel: channel ?? null,
      content,
      targetOffering: targetOffering ?? null,
      status: status ?? "draft",
      scheduledAt: scheduledAt ?? null,
    }).returning();

    return NextResponse.json({ campaign: result[0] }, { status: 201 });
  } catch (error) {
    logger.error("api/acp/marketing", "Error creating campaign", { error });
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
