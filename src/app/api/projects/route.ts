import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  try {
    const result = await db.execute("SELECT * FROM projects ORDER BY updated_at DESC");
    return NextResponse.json({ projects: result.rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, status, phase, repo_url, deploy_url, test_count, build_status, last_deploy_time, target_audience, action_plan } = body;

    if (id) {
      // Update existing
      const fields: string[] = [];
      const values: (string | number)[] = [];
      
      if (name !== undefined) { fields.push("name = ?"); values.push(name); }
      if (description !== undefined) { fields.push("description = ?"); values.push(description); }
      if (status !== undefined) { fields.push("status = ?"); values.push(status); }
      if (phase !== undefined) { fields.push("phase = ?"); values.push(phase); }
      if (repo_url !== undefined) { fields.push("repo_url = ?"); values.push(repo_url); }
      if (deploy_url !== undefined) { fields.push("deploy_url = ?"); values.push(deploy_url); }
      if (test_count !== undefined) { fields.push("test_count = ?"); values.push(test_count); }
      if (build_status !== undefined) { fields.push("build_status = ?"); values.push(build_status); }
      if (last_deploy_time !== undefined) { fields.push("last_deploy_time = ?"); values.push(last_deploy_time); }
      if (target_audience !== undefined) { fields.push("target_audience = ?"); values.push(target_audience); }
      if (action_plan !== undefined) { fields.push("action_plan = ?"); values.push(action_plan); }
      fields.push("updated_at = datetime('now')");

      await db.execute({
        sql: `UPDATE projects SET ${fields.join(", ")} WHERE id = ?`,
        args: [...values, id],
      });

      const result = await db.execute({ sql: "SELECT * FROM projects WHERE id = ?", args: [id] });
      return NextResponse.json({ project: result.rows[0] });
    } else {
      // Create new
      const result = await db.execute({
        sql: `INSERT INTO projects (name, description, status, phase, repo_url, deploy_url, test_count, build_status, last_deploy_time, target_audience, action_plan)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          name || "",
          description || "",
          status || "backlog",
          phase || "build",
          repo_url || "",
          deploy_url || "",
          test_count || 0,
          build_status || "unknown",
          last_deploy_time || "",
          target_audience || "",
          action_plan || "",
        ],
      });

      const newProject = await db.execute({
        sql: "SELECT * FROM projects WHERE id = ?",
        args: [result.lastInsertRowid!],
      });
      return NextResponse.json({ project: newProject.rows[0] }, { status: 201 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
