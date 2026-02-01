import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { idea_id, name, description, phase } = body;

    if (!idea_id) {
      return NextResponse.json({ error: "idea_id is required" }, { status: 400 });
    }

    // Get the idea
    const ideaRes = await db.execute({
      sql: "SELECT * FROM ideas WHERE id = ?",
      args: [idea_id],
    });

    if (ideaRes.rows.length === 0) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const idea = ideaRes.rows[0] as unknown as {
      id: number;
      title: string;
      description: string;
      status: string;
    };

    if (idea.status === "promoted") {
      return NextResponse.json({ error: "Idea is already promoted" }, { status: 400 });
    }

    // Create the project
    const projectName = name || idea.title;
    const projectDesc = description || idea.description;
    const projectPhase = phase || "build";

    const projectRes = await db.execute({
      sql: `INSERT INTO projects (name, description, status, phase)
            VALUES (?, ?, 'in_progress', ?)`,
      args: [projectName, projectDesc, projectPhase],
    });

    const projectId = Number(projectRes.lastInsertRowid);

    if (!projectId) {
      return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
    }

    // Update the idea
    await db.execute({
      sql: `UPDATE ideas SET status = 'promoted', promoted_to_project_id = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [projectId, idea_id],
    });

    // Log activity
    try {
      await db.execute({
        sql: `INSERT INTO activity (project_id, type, title, description)
              VALUES (?, 'promotion', 'Idea promoted to project', ?)`,
        args: [projectId, `Promoted from idea: "${idea.title}"`],
      });
    } catch {
      // Activity logging is non-critical
    }

    // Fetch the new project
    const newProject = await db.execute({
      sql: "SELECT * FROM projects WHERE id = ?",
      args: [projectId],
    });

    return NextResponse.json({
      project: newProject.rows[0],
      message: "Idea promoted to project successfully",
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
