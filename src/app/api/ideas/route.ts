import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const potential = searchParams.get("potential");

    let sql = "SELECT * FROM ideas";
    const conditions: string[] = [];
    const args: (string | number)[] = [];

    if (status) {
      conditions.push("status = ?");
      args.push(status);
    }
    if (potential) {
      conditions.push("potential = ?");
      args.push(potential);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY created_at DESC";

    const result = await db.execute({ sql, args });
    return NextResponse.json({ ideas: result.rows });
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
    const { id, title, description, source, market_notes, effort_estimate, potential, status, promoted_to_project_id, tags } = body;

    if (id) {
      // Update existing
      const fields: string[] = [];
      const values: (string | number | null)[] = [];

      if (title !== undefined) { fields.push("title = ?"); values.push(title); }
      if (description !== undefined) { fields.push("description = ?"); values.push(description); }
      if (source !== undefined) { fields.push("source = ?"); values.push(source); }
      if (market_notes !== undefined) { fields.push("market_notes = ?"); values.push(market_notes); }
      if (effort_estimate !== undefined) { fields.push("effort_estimate = ?"); values.push(effort_estimate); }
      if (potential !== undefined) { fields.push("potential = ?"); values.push(potential); }
      if (status !== undefined) { fields.push("status = ?"); values.push(status); }
      if (promoted_to_project_id !== undefined) { fields.push("promoted_to_project_id = ?"); values.push(promoted_to_project_id); }
      if (tags !== undefined) { fields.push("tags = ?"); values.push(typeof tags === "string" ? tags : JSON.stringify(tags)); }
      fields.push("updated_at = datetime('now')");

      await db.execute({
        sql: `UPDATE ideas SET ${fields.join(", ")} WHERE id = ?`,
        args: [...values, id],
      });

      const result = await db.execute({ sql: "SELECT * FROM ideas WHERE id = ?", args: [id] });
      return NextResponse.json({ idea: result.rows[0] });
    } else {
      // Create new
      const result = await db.execute({
        sql: `INSERT INTO ideas (title, description, source, market_notes, effort_estimate, potential, status, promoted_to_project_id, tags)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          title || "",
          description || "",
          source || "",
          market_notes || "",
          effort_estimate || "unknown",
          potential || "unknown",
          status || "new",
          promoted_to_project_id || null,
          typeof tags === "string" ? tags : JSON.stringify(tags || []),
        ],
      });

      const newIdea = await db.execute({
        sql: "SELECT * FROM ideas WHERE id = ?",
        args: [result.lastInsertRowid!],
      });
      return NextResponse.json({ idea: newIdea.rows[0] }, { status: 201 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
