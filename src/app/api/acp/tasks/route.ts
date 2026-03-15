import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import { db } from "@/db";
import { acpTasks, ACP_PILLARS, ACP_TASK_STATUSES } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Fetch tasks (optional filters: pillar, status)
export async function GET(req: NextRequest) {
  if (!checkApiAuth(req)) return unauthorizedResponse();
  try {
  if (!checkApiAuth(req)) return unauthorizedResponse();
    const { searchParams } = new URL(req.url);
    const pillar = searchParams.get("pillar");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") ?? "50");

    // Build conditions
    const conditions = [];
    if (pillar && ACP_PILLARS.includes(pillar as typeof ACP_PILLARS[number])) {
      conditions.push(eq(acpTasks.pillar, pillar));
    }
    if (status && ACP_TASK_STATUSES.includes(status as typeof ACP_TASK_STATUSES[number])) {
      conditions.push(eq(acpTasks.status, status));
    }

    let query = db.select().from(acpTasks);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const tasks = await query
      .orderBy(desc(acpTasks.priority), desc(acpTasks.createdAt))
      .limit(limit);

    return NextResponse.json({ tasks });
  } catch (error) {
    logger.error("api/acp/tasks", "Error fetching tasks", { error });
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

// POST: Create a new task
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { pillar, title, description, priority, status } = body;

    if (!pillar || !title) {
      return NextResponse.json({ error: "pillar and title are required" }, { status: 400 });
    }

    if (!ACP_PILLARS.includes(pillar)) {
      return NextResponse.json({ 
        error: `Invalid pillar. Must be one of: ${ACP_PILLARS.join(", ")}` 
      }, { status: 400 });
    }

    const result = await db.insert(acpTasks).values({
      pillar,
      title,
      description: description ?? null,
      priority: priority ?? 50,
      status: status ?? "pending",
    }).returning();

    return NextResponse.json({ task: result[0] }, { status: 201 });
  } catch (error) {
    logger.error("api/acp/tasks", "Error creating task", { error });
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
