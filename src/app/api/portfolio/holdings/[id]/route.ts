import { NextRequest, NextResponse } from "next/server";
import { db, portfolioHoldings } from "@/db";
import { eq } from "drizzle-orm";

// PUT /api/portfolio/holdings/[id] — Update holding
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
    const { ticker, target_allocation, cost_basis, shares } = body;

    const updateData: Partial<typeof portfolioHoldings.$inferInsert> = {
      updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    };

    if (ticker !== undefined) updateData.ticker = ticker;
    if (target_allocation !== undefined) updateData.targetAllocation = target_allocation;
    if (cost_basis !== undefined) updateData.costBasis = cost_basis;
    if (shares !== undefined) updateData.shares = shares;

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    await db.update(portfolioHoldings).set(updateData).where(eq(portfolioHoldings.id, numericId));

    const [result] = await db
      .select()
      .from(portfolioHoldings)
      .where(eq(portfolioHoldings.id, numericId));

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ holding: result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/portfolio/holdings/[id] — Remove holding
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
      .select({ id: portfolioHoldings.id })
      .from(portfolioHoldings)
      .where(eq(portfolioHoldings.id, numericId));

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.delete(portfolioHoldings).where(eq(portfolioHoldings.id, numericId));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
