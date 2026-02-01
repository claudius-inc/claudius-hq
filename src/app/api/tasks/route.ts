import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const status = searchParams.get("status");

    let sql = `SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE 1=1`;
    const args: (string | number)[] = [];

    if (projectId) {
      sql += " AND t.project_id = ?";
      args.push(Number(projectId));
    }
    if (status) {
      sql += " AND t.status = ?";
      args.push(status);
    }

    sql += " ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, t.updated_at DESC";

    const result = await db.execute({ sql, args });
    return NextResponse.json({ tasks: result.rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, project_id, title, description, status, priority, category, blocker_reason } = body;

    if (id) {
      const fields: string[] = [];
      const values: (string | number)[] = [];

      if (project_id !== undefined) { fields.push("project_id = ?"); values.push(project_id); }
      if (title !== undefined) { fields.push("title = ?"); values.push(title); }
      if (description !== undefined) { fields.push("description = ?"); values.push(description); }
      if (status !== undefined) { fields.push("status = ?"); values.push(status); }
      if (priority !== undefined) { fields.push("priority = ?"); values.push(priority); }
      if (category !== undefined) { fields.push("category = ?"); values.push(category); }
      if (blocker_reason !== undefined) { fields.push("blocker_reason = ?"); values.push(blocker_reason); }
      fields.push("updated_at = datetime('now')");

      await db.execute({
        sql: `UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`,
        args: [...values, id],
      });

      const result = await db.execute({ sql: "SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ?", args: [id] });
      return NextResponse.json({ task: result.rows[0] });
    } else {
      const result = await db.execute({
        sql: `INSERT INTO tasks (project_id, title, description, status, priority, category, blocker_reason)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          project_id,
          title || "",
          description || "",
          status || "backlog",
          priority || "medium",
          category || "",
          blocker_reason || "",
        ],
      });

      const newTask = await db.execute({
        sql: "SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ?",
        args: [result.lastInsertRowid!],
      });
      return NextResponse.json({ task: newTask.rows[0] }, { status: 201 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
