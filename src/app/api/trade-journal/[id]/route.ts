import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tradeJournal } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/trade-journal/:id
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [entry] = await db
      .select()
      .from(tradeJournal)
      .where(eq(tradeJournal.id, parseInt(id)));

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PUT /api/trade-journal/:id
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updateData: Record<string, unknown> = {};
    const fields = [
      "ticker", "action", "price", "shares", "date", "thesis",
      "catalysts", "invalidators", "outcome", "exitPrice", "exitDate",
      "lessonsLearned", "emotionalState", "tags",
    ];

    for (const field of fields) {
      if (body[field] !== undefined) {
        if (field === "tags" && Array.isArray(body[field])) {
          updateData[field] = JSON.stringify(body[field]);
        } else if (field === "ticker" && typeof body[field] === "string") {
          updateData[field] = body[field].toUpperCase().trim();
        } else {
          updateData[field] = body[field];
        }
      }
    }

    updateData.updatedAt = new Date().toISOString().replace("T", " ").slice(0, 19);

    const [entry] = await db
      .update(tradeJournal)
      .set(updateData)
      .where(eq(tradeJournal.id, parseInt(id)))
      .returning();

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/trade-journal/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(tradeJournal)
      .where(eq(tradeJournal.id, parseInt(id)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
