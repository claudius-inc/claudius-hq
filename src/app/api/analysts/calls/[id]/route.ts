import { NextResponse } from "next/server";
import { db } from "@/db";
import { analystCalls } from "@/db/schema";
import { eq } from "drizzle-orm";

// PATCH /api/analysts/calls/:id - Update call
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const callId = parseInt(id);
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.ticker !== undefined) updateData.ticker = body.ticker.toUpperCase();
    if (body.action !== undefined) updateData.action = body.action;
    if (body.priceTarget !== undefined)
      updateData.priceTarget = parseFloat(body.priceTarget);
    if (body.priceAtCall !== undefined)
      updateData.priceAtCall = parseFloat(body.priceAtCall);
    if (body.currentPrice !== undefined)
      updateData.currentPrice = parseFloat(body.currentPrice);
    if (body.callDate !== undefined) updateData.callDate = body.callDate;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.outcome !== undefined) updateData.outcome = body.outcome;

    const [updated] = await db
      .update(analystCalls)
      .set(updateData)
      .where(eq(analystCalls.id, callId))
      .returning();

    return NextResponse.json({ call: updated });
  } catch (error) {
    console.error("Failed to update call:", error);
    return NextResponse.json(
      { error: "Failed to update call" },
      { status: 500 }
    );
  }
}

// DELETE /api/analysts/calls/:id - Delete call
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const callId = parseInt(id);

    await db.delete(analystCalls).where(eq(analystCalls.id, callId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete call:", error);
    return NextResponse.json(
      { error: "Failed to delete call" },
      { status: 500 }
    );
  }
}
