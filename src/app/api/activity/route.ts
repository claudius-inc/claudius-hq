import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || "50");
    const projectId = searchParams.get("project_id");

    let sql = `SELECT a.*, p.name as project_name FROM activity a LEFT JOIN projects p ON a.project_id = p.id WHERE 1=1`;
    const args: (string | number)[] = [];

    if (projectId) {
      sql += " AND a.project_id = ?";
      args.push(Number(projectId));
    }

    sql += " ORDER BY a.created_at DESC LIMIT ?";
    args.push(limit);

    const result = await db.execute({ sql, args });
    return NextResponse.json({ activity: result.rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project_id, type, title, description, metadata } = body;

    const result = await db.execute({
      sql: `INSERT INTO activity (project_id, type, title, description, metadata)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        project_id || null,
        type || "general",
        title || "",
        description || "",
        metadata ? JSON.stringify(metadata) : "{}",
      ],
    });

    const newActivity = await db.execute({
      sql: "SELECT a.*, p.name as project_name FROM activity a LEFT JOIN projects p ON a.project_id = p.id WHERE a.id = ?",
      args: [result.lastInsertRowid!],
    });
    return NextResponse.json({ activity: newActivity.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
