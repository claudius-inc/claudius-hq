import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";

// POST /api/themes/[id]/stocks - Add stock to theme
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB();
    const { id } = await params;

    const body = await request.json();
    const { ticker, target_price, status, notes } = body;

    if (!ticker || typeof ticker !== "string" || ticker.trim().length === 0) {
      return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
    }

    // Check theme exists
    const themeResult = await db.execute({
      sql: "SELECT id FROM themes WHERE id = ?",
      args: [id],
    });

    if (themeResult.rows.length === 0) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    const upperTicker = ticker.trim().toUpperCase();
    const validStatus = ["watching", "accumulating", "holding"].includes(status) ? status : "watching";

    const result = await db.execute({
      sql: `INSERT INTO theme_stocks (theme_id, ticker, target_price, status, notes) 
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, upperTicker, target_price ?? null, validStatus, notes ?? null],
    });

    return NextResponse.json({
      stock: {
        id: Number(result.lastInsertRowid),
        theme_id: Number(id),
        ticker: upperTicker,
        target_price: target_price ?? null,
        status: validStatus,
        notes: notes ?? null,
        added_at: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (e) {
    const error = String(e);
    if (error.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "Stock already in theme" }, { status: 409 });
    }
    console.error("Failed to add stock to theme:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/themes/[id]/stocks - Update stock in theme
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB();
    const { id } = await params;

    const body = await request.json();
    const { ticker, target_price, status, notes } = body;

    if (!ticker || typeof ticker !== "string") {
      return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
    }

    const upperTicker = ticker.trim().toUpperCase();

    // Build dynamic update
    const updates: string[] = [];
    const args: (string | number | null)[] = [];

    if (target_price !== undefined) {
      updates.push("target_price = ?");
      args.push(target_price);
    }
    if (status !== undefined) {
      if (["watching", "accumulating", "holding"].includes(status)) {
        updates.push("status = ?");
        args.push(status);
      }
    }
    if (notes !== undefined) {
      updates.push("notes = ?");
      args.push(notes);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    args.push(id, upperTicker);

    const result = await db.execute({
      sql: `UPDATE theme_stocks SET ${updates.join(", ")} WHERE theme_id = ? AND ticker = ?`,
      args,
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: "Stock not found in theme" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Failed to update stock in theme:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
