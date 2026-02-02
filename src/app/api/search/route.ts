import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    const term = `%${q.trim()}%`;

    const [projectsRes, tasksRes, activityRes, commentsRes, researchRes] =
      await Promise.all([
        db.execute({
          sql: "SELECT id, name, description, status FROM projects WHERE name LIKE ? OR description LIKE ? LIMIT 5",
          args: [term, term],
        }),
        db.execute({
          sql: `SELECT t.id, t.title, t.status, t.priority, p.name as project_name
                FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
                WHERE t.title LIKE ? OR t.description LIKE ? LIMIT 5`,
          args: [term, term],
        }),
        db.execute({
          sql: `SELECT a.id, a.title, a.type, a.created_at, p.name as project_name
                FROM activity a LEFT JOIN projects p ON a.project_id = p.id
                WHERE a.title LIKE ? OR a.description LIKE ? LIMIT 5`,
          args: [term, term],
        }),
        db.execute({
          sql: "SELECT id, text, target_type, target_id, author, created_at FROM comments WHERE text LIKE ? LIMIT 5",
          args: [term],
        }),
        db.execute({
          sql: `SELECT rn.id, rn.title, rn.note_type, rn.created_at, p.name as project_name
                FROM research_notes rn LEFT JOIN projects p ON rn.project_id = p.id
                WHERE rn.title LIKE ? OR rn.content LIKE ? LIMIT 5`,
          args: [term, term],
        }),
      ]);

    return NextResponse.json({
      results: {
        projects: projectsRes.rows,
        tasks: tasksRes.rows,
        activity: activityRes.rows,
        comments: commentsRes.rows,
        research: researchRes.rows,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
