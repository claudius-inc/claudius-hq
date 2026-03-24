import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, themeStocks } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

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

    // Invalidate theme pages
    revalidatePath("/markets/themes");
    revalidatePath(`/markets/themes/${numericId}`);
    logger.info("api/themes/[id]/stocks/[ticker]", `Revalidated theme pages after removing ${upperTicker}`);

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("api/themes/[id]/stocks/[ticker]", "Failed to remove stock from theme", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
