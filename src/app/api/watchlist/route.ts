import { NextRequest, NextResponse } from "next/server";
import { db, watchlist } from "@/db";
import { desc, eq } from "drizzle-orm";

// GET /api/watchlist — List all watchlist items
export async function GET() {
  try {
    const items = await db.select().from(watchlist).orderBy(desc(watchlist.addedAt));
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/watchlist — Add ticker to watchlist
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, target_price, notes, status } = body;

    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 });
    }

    const upperTicker = ticker.toUpperCase().trim();

    // Check if already exists
    const existing = await db
      .select({ id: watchlist.id })
      .from(watchlist)
      .where(eq(watchlist.ticker, upperTicker));

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `${upperTicker} is already in watchlist` },
        { status: 409 }
      );
    }

    const [newItem] = await db
      .insert(watchlist)
      .values({
        ticker: upperTicker,
        targetPrice: target_price ?? null,
        notes: notes ?? null,
        status: status ?? "watching",
      })
      .returning();

    return NextResponse.json({ item: newItem }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
