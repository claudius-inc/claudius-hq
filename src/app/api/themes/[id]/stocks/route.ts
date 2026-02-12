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
    const { ticker } = body;

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

    const result = await db.execute({
      sql: "INSERT INTO theme_stocks (theme_id, ticker) VALUES (?, ?)",
      args: [id, upperTicker],
    });

    return NextResponse.json({
      stock: {
        id: Number(result.lastInsertRowid),
        theme_id: Number(id),
        ticker: upperTicker,
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
