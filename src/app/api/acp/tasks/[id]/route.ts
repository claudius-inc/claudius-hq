import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { acpTasks, ACP_TASK_STATUSES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: Fetch a single task
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const taskId = parseInt(id);
    
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }

    const tasks = await db
      .select()
      .from(acpTasks)
      .where(eq(acpTasks.id, taskId))
      .limit(1);

    if (tasks.length === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task: tasks[0] });
  } catch (error) {
    logger.error("api/acp/tasks/[id]", "Error fetching task", { error });
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

// PATCH: Update a task
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const taskId = parseInt(id);
    
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }

    const body = await req.json();
    const { status, result, priority, description, title } = body;

    // Build update object
    const updates: Record<string, unknown> = {};
    
    if (status !== undefined) {
      if (!ACP_TASK_STATUSES.includes(status)) {
        return NextResponse.json({ 
          error: `Invalid status. Must be one of: ${ACP_TASK_STATUSES.join(", ")}` 
        }, { status: 400 });
      }
      updates.status = status;
      
      // Auto-set timestamps based on status
      if (status === "in_progress" && !body.assignedAt) {
        updates.assignedAt = new Date().toISOString();
      }
      if ((status === "done" || status === "skipped") && !body.completedAt) {
        updates.completedAt = new Date().toISOString();
      }
      // Clear timestamps when reopening
      if (status === "pending") {
        updates.assignedAt = null;
        updates.completedAt = null;
      }
    }
    
    if (result !== undefined) updates.result = result;
    if (priority !== undefined) updates.priority = priority;
    if (description !== undefined) updates.description = description;
    if (title !== undefined) updates.title = title;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await db.update(acpTasks).set(updates).where(eq(acpTasks.id, taskId));

    const updated = await db
      .select()
      .from(acpTasks)
      .where(eq(acpTasks.id, taskId))
      .limit(1);

    if (updated.length === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Revalidate the tasks page
    revalidatePath("/acp/tasks");

    return NextResponse.json({ task: updated[0] });
  } catch (error) {
    logger.error("api/acp/tasks/[id]", "Error updating task", { error });
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

// DELETE: Delete a task
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const taskId = parseInt(id);
    
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }

    await db.delete(acpTasks).where(eq(acpTasks.id, taskId));

    // Revalidate the tasks page
    revalidatePath("/acp/tasks");

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("api/acp/tasks/[id]", "Error deleting task", { error });
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
