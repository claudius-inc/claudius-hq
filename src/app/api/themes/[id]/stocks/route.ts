import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db, themes, themeStocks, THEME_STOCK_STATUSES } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

// POST /api/themes/[id]/stocks - Add stock to theme
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await request.json();
    const { ticker, target_price, status, notes } = body;

    if (!ticker || typeof ticker !== "string" || ticker.trim().length === 0) {
      return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
    }

    // Check theme exists
    const [theme] = await db.select({ id: themes.id }).from(themes).where(eq(themes.id, numericId));

    if (!theme) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    const upperTicker = ticker.trim().toUpperCase();
    const validStatus = THEME_STOCK_STATUSES.includes(status) ? status : "watching";

    const [newStock] = await db
      .insert(themeStocks)
      .values({
        themeId: numericId,
        ticker: upperTicker,
        targetPrice: target_price ?? null,
        status: validStatus,
        notes: notes ?? null,
      })
      .returning();

    // Invalidate theme pages
    revalidatePath("/markets/themes");
    revalidateTag("themes");
    revalidatePath(`/markets/themes/${numericId}`);
    logger.info("api/themes/[id]/stocks", `Revalidated theme pages after adding ${upperTicker}`);

    return NextResponse.json({ stock: newStock }, { status: 201 });
  } catch (e) {
    const error = String(e);
    if (error.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "Stock already in theme" }, { status: 409 });
    }
    logger.error("api/themes/[id]/stocks", "Failed to add stock to theme", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/themes/[id]/stocks - Update stock in theme
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await request.json();
    const { ticker, new_ticker, target_price, status, notes } = body;

    if (!ticker || typeof ticker !== "string") {
      return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
    }

    const upperTicker = ticker.trim().toUpperCase();
    const upperNewTicker = new_ticker?.trim().toUpperCase() || null;

    // Build update data
    const updateData: Partial<typeof themeStocks.$inferInsert> = {};

    // Handle ticker rename
    if (upperNewTicker && upperNewTicker !== upperTicker) {
      // Check new ticker doesn't already exist in this theme
      const existing = await db
        .select()
        .from(themeStocks)
        .where(and(eq(themeStocks.themeId, numericId), eq(themeStocks.ticker, upperNewTicker)));
      if (existing.length > 0) {
        return NextResponse.json({ error: `${upperNewTicker} already exists in this theme` }, { status: 409 });
      }
      updateData.ticker = upperNewTicker;
    }

    if (target_price !== undefined) {
      updateData.targetPrice = target_price;
    }
    if (status !== undefined && THEME_STOCK_STATUSES.includes(status)) {
      updateData.status = status;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const result = await db
      .update(themeStocks)
      .set(updateData)
      .where(and(eq(themeStocks.themeId, numericId), eq(themeStocks.ticker, upperTicker)));

    // Check if any rows were affected (Drizzle doesn't return rowsAffected directly)
    const lookupTicker = upperNewTicker || upperTicker;
    const [updated] = await db
      .select()
      .from(themeStocks)
      .where(and(eq(themeStocks.themeId, numericId), eq(themeStocks.ticker, lookupTicker)));

    if (!updated) {
      return NextResponse.json({ error: "Stock not found in theme" }, { status: 404 });
    }

    // Invalidate theme pages
    revalidatePath("/markets/themes");
    revalidateTag("themes");
    revalidatePath(`/markets/themes/${numericId}`);
    logger.info("api/themes/[id]/stocks", `Revalidated theme pages after updating ${upperTicker}`);

    return NextResponse.json({ success: true, stock: updated });
  } catch (e) {
    logger.error("api/themes/[id]/stocks", "Failed to update stock in theme", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
