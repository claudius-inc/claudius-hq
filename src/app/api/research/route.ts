import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ideaId = searchParams.get("idea_id");
    const projectId = searchParams.get("project_id");
    const noteType = searchParams.get("note_type");

    let sql = `SELECT rn.*, i.title as idea_title, p.name as project_name
               FROM research_notes rn
               LEFT JOIN ideas i ON rn.idea_id = i.id
               LEFT JOIN projects p ON rn.project_id = p.id`;
    const conditions: string[] = [];
    const args: (string | number)[] = [];

    if (ideaId) {
      conditions.push("rn.idea_id = ?");
      args.push(Number(ideaId));
    }
    if (projectId) {
      conditions.push("rn.project_id = ?");
      args.push(Number(projectId));
    }
    if (noteType) {
      conditions.push("rn.note_type = ?");
      args.push(noteType);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY rn.created_at DESC";

    const result = await db.execute({ sql, args });
    return NextResponse.json({ notes: result.rows });
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
    const { title, content, idea_id, project_id, source_url, note_type } = body;

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const result = await db.execute({
      sql: `INSERT INTO research_notes (idea_id, project_id, title, content, source_url, note_type)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        idea_id || null,
        project_id || null,
        title,
        content || "",
        source_url || "",
        note_type || "general",
      ],
    });

    const newNote = await db.execute({
      sql: "SELECT * FROM research_notes WHERE id = ?",
      args: [result.lastInsertRowid!],
    });
    return NextResponse.json({ note: newNote.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
