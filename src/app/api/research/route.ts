import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/research?projectId=7 — list research pages for a project
export async function GET(req: NextRequest) {
  await ensureDB();
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const result = await db.execute({
      sql: "SELECT * FROM research_pages WHERE project_id = ? ORDER BY sort_order, id",
      args: [parseInt(projectId, 10)],
    });

    return NextResponse.json({ pages: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/research — add a new research page
export async function POST(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDB();
  try {
    const body = await req.json();
    const { project_id, slug, title, content, sort_order } = body;

    if (!project_id || !slug || !title || !content) {
      return NextResponse.json(
        { error: "project_id, slug, title, and content are required" },
        { status: 400 }
      );
    }

    const result = await db.execute({
      sql: `INSERT INTO research_pages (project_id, slug, title, content, sort_order)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(project_id, slug) DO UPDATE SET
              title = excluded.title,
              content = excluded.content,
              sort_order = excluded.sort_order,
              updated_at = datetime('now')`,
      args: [
        parseInt(project_id, 10),
        slug,
        title,
        content,
        sort_order || 0,
      ],
    });

    return NextResponse.json({ 
      success: true, 
      id: result.lastInsertRowid,
      message: "Research page saved"
    }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/research?id=123 — delete a research page
export async function DELETE(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDB();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    await db.execute({
      sql: "DELETE FROM research_pages WHERE id = ?",
      args: [parseInt(id, 10)],
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
