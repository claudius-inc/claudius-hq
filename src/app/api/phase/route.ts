import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isApiAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { project_id, phase } = body;

    if (!project_id || !phase) {
      return NextResponse.json({ error: "project_id and phase are required" }, { status: 400 });
    }

    const validPhases = ["idea", "research", "build", "launch", "grow", "iterate", "maintain"];
    if (!validPhases.includes(phase)) {
      return NextResponse.json({ error: `Invalid phase. Must be one of: ${validPhases.join(", ")}` }, { status: 400 });
    }

    // Update project phase
    await db.execute({
      sql: "UPDATE projects SET phase = ?, updated_at = datetime('now') WHERE id = ?",
      args: [phase, project_id],
    });

    // Auto-create checklist progress entries from template for the new phase
    const templates = await db.execute({
      sql: "SELECT id FROM phase_checklists WHERE phase = ? AND is_template = 1",
      args: [phase],
    });

    let itemsCreated = 0;
    for (const t of templates.rows) {
      const item = t as unknown as { id: number };
      try {
        await db.execute({
          sql: `INSERT OR IGNORE INTO project_checklist_progress (project_id, checklist_item_id, completed, completed_at, notes)
                VALUES (?, ?, 0, '', '')`,
          args: [project_id, item.id],
        });
        itemsCreated++;
      } catch {
        // Ignore duplicates
      }
    }

    // Log activity
    await db.execute({
      sql: `INSERT INTO activity (project_id, type, title, description) VALUES (?, 'phase_change', ?, ?)`,
      args: [project_id, `Phase changed to ${phase}`, `Project transitioned to ${phase} phase with ${itemsCreated} checklist items`],
    });

    const project = await db.execute({
      sql: "SELECT * FROM projects WHERE id = ?",
      args: [project_id],
    });

    return NextResponse.json({
      ok: true,
      project: project.rows[0],
      checklist_items_created: itemsCreated,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
