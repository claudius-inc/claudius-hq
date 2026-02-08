import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { WatchlistItem } from "@/lib/types";

// GET /api/watchlist — List all watchlist items
export async function GET() {
  await ensureDB();
  try {
    const result = await db.execute(
      "SELECT * FROM watchlist ORDER BY added_at DESC"
    );
    return NextResponse.json({ items: result.rows as unknown as WatchlistItem[] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/watchlist — Add ticker to watchlist
export async function POST(req: NextRequest) {
  await ensureDB();
  try {
    const body = await req.json();
    const { ticker, target_price, notes, status } = body;

    if (!ticker) {
      return NextResponse.json(
        { error: "ticker is required" },
        { status: 400 }
      );
    }

    const upperTicker = ticker.toUpperCase().trim();

    // Check if already exists
    const existing = await db.execute({
      sql: "SELECT id FROM watchlist WHERE ticker = ?",
      args: [upperTicker],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: `${upperTicker} is already in watchlist` },
        { status: 409 }
      );
    }

    const result = await db.execute({
      sql: `INSERT INTO watchlist (ticker, target_price, notes, status) 
            VALUES (?, ?, ?, ?)`,
      args: [
        upperTicker,
        target_price ?? null,
        notes ?? null,
        status ?? "watching",
      ],
    });

    const newItem = await db.execute({
      sql: "SELECT * FROM watchlist WHERE id = ?",
      args: [result.lastInsertRowid!],
    });

    return NextResponse.json(
      { item: newItem.rows[0] as unknown as WatchlistItem },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
