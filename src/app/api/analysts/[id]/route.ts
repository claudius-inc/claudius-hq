import { NextResponse } from "next/server";
import { db } from "@/db";
import { analysts, analystCalls } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/analysts/:id - Get single analyst with all calls
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const analystId = parseInt(id);

    const [analyst] = await db
      .select()
      .from(analysts)
      .where(eq(analysts.id, analystId));

    if (!analyst) {
      return NextResponse.json({ error: "Analyst not found" }, { status: 404 });
    }

    const calls = await db
      .select()
      .from(analystCalls)
      .where(eq(analystCalls.analystId, analystId));

    return NextResponse.json({ analyst, calls });
  } catch (error) {
    console.error("Failed to fetch analyst:", error);
    return NextResponse.json(
      { error: "Failed to fetch analyst" },
      { status: 500 }
    );
  }
}

// PATCH /api/analysts/:id - Update analyst
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const analystId = parseInt(id);
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.firm !== undefined) updateData.firm = body.firm;
    if (body.specialty !== undefined) updateData.specialty = body.specialty;
    if (body.successRate !== undefined)
      updateData.successRate = parseFloat(body.successRate);
    if (body.avgReturn !== undefined)
      updateData.avgReturn = parseFloat(body.avgReturn);
    if (body.notes !== undefined) updateData.notes = body.notes;

    const [updated] = await db
      .update(analysts)
      .set(updateData)
      .where(eq(analysts.id, analystId))
      .returning();

    return NextResponse.json({ analyst: updated });
  } catch (error) {
    console.error("Failed to update analyst:", error);
    return NextResponse.json(
      { error: "Failed to update analyst" },
      { status: 500 }
    );
  }
}

// DELETE /api/analysts/:id - Delete analyst
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const analystId = parseInt(id);

    // Delete associated calls first
    await db.delete(analystCalls).where(eq(analystCalls.analystId, analystId));

    // Delete analyst
    await db.delete(analysts).where(eq(analysts.id, analystId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete analyst:", error);
    return NextResponse.json(
      { error: "Failed to delete analyst" },
      { status: 500 }
    );
  }
}
