import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { WatchlistItem } from "@/lib/types";

// PUT /api/watchlist/[id] — Update watchlist item
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureDB();
  const { id } = params;
  const numericId = parseInt(id, 10);

  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { target_price, notes, status } = body;

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (target_price !== undefined) {
      fields.push("target_price = ?");
      values.push(target_price);
    }
    if (notes !== undefined) {
      fields.push("notes = ?");
      values.push(notes);
    }
    if (status !== undefined) {
      fields.push("status = ?");
      values.push(status);
    }
    fields.push("updated_at = datetime('now')");

    if (fields.length === 1) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    await db.execute({
      sql: `UPDATE watchlist SET ${fields.join(", ")} WHERE id = ?`,
      args: [...values, numericId],
    });

    const result = await db.execute({
      sql: "SELECT * FROM watchlist WHERE id = ?",
      args: [numericId],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ item: result.rows[0] as unknown as WatchlistItem });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/watchlist/[id] — Remove from watchlist
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureDB();
  const { id } = params;
  const numericId = parseInt(id, 10);

  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const existing = await db.execute({
      sql: "SELECT id FROM watchlist WHERE id = ?",
      args: [numericId],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.execute({
      sql: "DELETE FROM watchlist WHERE id = ?",
      args: [numericId],
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
