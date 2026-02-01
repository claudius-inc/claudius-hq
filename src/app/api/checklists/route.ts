import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phase = searchParams.get("phase");
    const projectId = searchParams.get("project_id");

    if (phase && projectId) {
      // Get template items for the phase + project progress
      const result = await db.execute({
        sql: `SELECT pc.*, pcp.completed, pcp.completed_at, pcp.notes, pcp.id as progress_id
              FROM phase_checklists pc
              LEFT JOIN project_checklist_progress pcp ON pc.id = pcp.checklist_item_id AND pcp.project_id = ?
              WHERE pc.phase = ? AND pc.is_template = 1
              ORDER BY pc.item_order`,
        args: [Number(projectId), phase],
      });
      return NextResponse.json({ checklist: result.rows });
    } else if (phase) {
      // Get template items for the phase
      const result = await db.execute({
        sql: "SELECT * FROM phase_checklists WHERE phase = ? AND is_template = 1 ORDER BY item_order",
        args: [phase],
      });
      return NextResponse.json({ checklist: result.rows });
    } else {
      // Get all templates
      const result = await db.execute("SELECT * FROM phase_checklists WHERE is_template = 1 ORDER BY phase, item_order");
      return NextResponse.json({ checklist: result.rows });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isApiAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "seed") {
      // Force re-seed templates
      await db.execute("DELETE FROM phase_checklists WHERE is_template = 1");
      const { initDB } = await import("@/lib/db");
      await initDB();
      return NextResponse.json({ ok: true, message: "Templates re-seeded" });
    }

    if (action === "update_progress") {
      const { project_id, checklist_item_id, completed, notes } = body;
      if (!project_id || !checklist_item_id) {
        return NextResponse.json({ error: "project_id and checklist_item_id required" }, { status: 400 });
      }

      await db.execute({
        sql: `INSERT INTO project_checklist_progress (project_id, checklist_item_id, completed, completed_at, notes)
              VALUES (?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE '' END, ?)
              ON CONFLICT(project_id, checklist_item_id) DO UPDATE SET
                completed = excluded.completed,
                completed_at = CASE WHEN excluded.completed = 1 THEN datetime('now') ELSE '' END,
                notes = COALESCE(excluded.notes, notes)`,
        args: [project_id, checklist_item_id, completed ? 1 : 0, completed ? 1 : 0, notes || ""],
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "init_progress") {
      // Create progress entries for a project's current phase
      const { project_id, phase } = body;
      if (!project_id || !phase) {
        return NextResponse.json({ error: "project_id and phase required" }, { status: 400 });
      }

      const templates = await db.execute({
        sql: "SELECT id FROM phase_checklists WHERE phase = ? AND is_template = 1",
        args: [phase],
      });

      for (const t of templates.rows) {
        const item = t as unknown as { id: number };
        await db.execute({
          sql: `INSERT OR IGNORE INTO project_checklist_progress (project_id, checklist_item_id, completed, completed_at, notes)
                VALUES (?, ?, 0, '', '')`,
          args: [project_id, item.id],
        });
      }

      return NextResponse.json({ ok: true, items_created: templates.rows.length });
    }

    return NextResponse.json({ error: "Unknown action. Use 'seed', 'update_progress', or 'init_progress'" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
