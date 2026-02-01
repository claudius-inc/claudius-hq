import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const metricName = searchParams.get("metric_name");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let sql = "SELECT m.*, p.name as project_name FROM metrics m LEFT JOIN projects p ON m.project_id = p.id";
    const conditions: string[] = [];
    const args: (string | number)[] = [];

    if (projectId) {
      conditions.push("m.project_id = ?");
      args.push(Number(projectId));
    }
    if (metricName) {
      conditions.push("m.metric_name = ?");
      args.push(metricName);
    }
    if (from) {
      conditions.push("m.recorded_at >= ?");
      args.push(from);
    }
    if (to) {
      conditions.push("m.recorded_at <= ?");
      args.push(to);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY m.recorded_at DESC";

    const result = await db.execute({ sql, args });
    return NextResponse.json({ metrics: result.rows });
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
    const { project_id, metric_name, metric_value, recorded_at } = body;

    if (!project_id || !metric_name || metric_value === undefined) {
      return NextResponse.json({ error: "project_id, metric_name, and metric_value are required" }, { status: 400 });
    }

    const sql = recorded_at
      ? "INSERT INTO metrics (project_id, metric_name, metric_value, recorded_at) VALUES (?, ?, ?, ?)"
      : "INSERT INTO metrics (project_id, metric_name, metric_value) VALUES (?, ?, ?)";
    const args = recorded_at
      ? [project_id, metric_name, metric_value, recorded_at]
      : [project_id, metric_name, metric_value];

    const result = await db.execute({ sql, args });

    const newMetric = await db.execute({
      sql: "SELECT * FROM metrics WHERE id = ?",
      args: [result.lastInsertRowid!],
    });
    return NextResponse.json({ metric: newMetric.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
