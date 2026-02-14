import { NextRequest, NextResponse } from "next/server";
import { db, watchlist } from "@/db";
import { eq } from "drizzle-orm";

// PUT /api/watchlist/[id] — Update watchlist item
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const numericId = parseInt(id, 10);

  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { target_price, notes, status } = body;

    const updateData: Partial<typeof watchlist.$inferInsert> = {
      updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    };

    if (target_price !== undefined) updateData.targetPrice = target_price;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;

    // Check we have something to update beyond updatedAt
    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    await db.update(watchlist).set(updateData).where(eq(watchlist.id, numericId));

    const [result] = await db.select().from(watchlist).where(eq(watchlist.id, numericId));

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ item: result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/watchlist/[id] — Remove from watchlist
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const numericId = parseInt(id, 10);

  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const [existing] = await db
      .select({ id: watchlist.id })
      .from(watchlist)
      .where(eq(watchlist.id, numericId));

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.delete(watchlist).where(eq(watchlist.id, numericId));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
