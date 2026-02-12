import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";

// DELETE /api/themes/[id]/stocks/[ticker] - Remove stock from theme
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ticker: string }> }
) {
  try {
    await ensureDB();
    const { id, ticker } = await params;

    const upperTicker = ticker.toUpperCase();

    const result = await db.execute({
      sql: "DELETE FROM theme_stocks WHERE theme_id = ? AND ticker = ?",
      args: [id, upperTicker],
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: "Stock not found in theme" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Failed to remove stock from theme:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
