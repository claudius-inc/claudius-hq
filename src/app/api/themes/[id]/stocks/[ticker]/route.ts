import { NextRequest, NextResponse } from "next/server";
import { db, themeStocks } from "@/db";
import { eq, and } from "drizzle-orm";

// DELETE /api/themes/[id]/stocks/[ticker] - Remove stock from theme
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; ticker: string } }
) {
  try {
    const { id, ticker } = params;
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const upperTicker = ticker.toUpperCase();

    // Check if exists first
    const [existing] = await db
      .select({ id: themeStocks.id })
      .from(themeStocks)
      .where(and(eq(themeStocks.themeId, numericId), eq(themeStocks.ticker, upperTicker)));

    if (!existing) {
      return NextResponse.json({ error: "Stock not found in theme" }, { status: 404 });
    }

    await db
      .delete(themeStocks)
      .where(and(eq(themeStocks.themeId, numericId), eq(themeStocks.ticker, upperTicker)));

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Failed to remove stock from theme:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
