import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  try {
    const result = await db.execute("SELECT * FROM crons ORDER BY next_run ASC");
    return NextResponse.json({ crons: result.rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, schedule, description, last_run, next_run, status, last_error } = body;

    if (id) {
      const fields: string[] = [];
      const values: (string | number)[] = [];

      if (name !== undefined) { fields.push("name = ?"); values.push(name); }
      if (schedule !== undefined) { fields.push("schedule = ?"); values.push(schedule); }
      if (description !== undefined) { fields.push("description = ?"); values.push(description); }
      if (last_run !== undefined) { fields.push("last_run = ?"); values.push(last_run); }
      if (next_run !== undefined) { fields.push("next_run = ?"); values.push(next_run); }
      if (status !== undefined) { fields.push("status = ?"); values.push(status); }
      if (last_error !== undefined) { fields.push("last_error = ?"); values.push(last_error); }
      fields.push("updated_at = datetime('now')");

      await db.execute({
        sql: `UPDATE crons SET ${fields.join(", ")} WHERE id = ?`,
        args: [...values, id],
      });

      const result = await db.execute({ sql: "SELECT * FROM crons WHERE id = ?", args: [id] });
      return NextResponse.json({ cron: result.rows[0] });
    } else {
      // Check if name exists, upsert
      const existing = await db.execute({ sql: "SELECT id FROM crons WHERE name = ?", args: [name] });
      
      if (existing.rows.length > 0) {
        const existingId = existing.rows[0].id;
        const fields: string[] = [];
        const values: (string | number)[] = [];

        if (schedule !== undefined) { fields.push("schedule = ?"); values.push(schedule); }
        if (description !== undefined) { fields.push("description = ?"); values.push(description); }
        if (last_run !== undefined) { fields.push("last_run = ?"); values.push(last_run); }
        if (next_run !== undefined) { fields.push("next_run = ?"); values.push(next_run); }
        if (status !== undefined) { fields.push("status = ?"); values.push(status); }
        if (last_error !== undefined) { fields.push("last_error = ?"); values.push(last_error); }
        fields.push("updated_at = datetime('now')");

        await db.execute({
          sql: `UPDATE crons SET ${fields.join(", ")} WHERE id = ?`,
          args: [...values, existingId as number],
        });

        const result = await db.execute({ sql: "SELECT * FROM crons WHERE id = ?", args: [existingId as number] });
        return NextResponse.json({ cron: result.rows[0] });
      }

      const result = await db.execute({
        sql: `INSERT INTO crons (name, schedule, description, last_run, next_run, status, last_error)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          name,
          schedule || "",
          description || "",
          last_run || "",
          next_run || "",
          status || "active",
          last_error || "",
        ],
      });

      const newCron = await db.execute({
        sql: "SELECT * FROM crons WHERE id = ?",
        args: [result.lastInsertRowid!],
      });
      return NextResponse.json({ cron: newCron.rows[0] }, { status: 201 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
