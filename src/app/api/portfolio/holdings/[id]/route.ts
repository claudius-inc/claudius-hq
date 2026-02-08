import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { PortfolioHolding } from "@/lib/types";

// PUT /api/portfolio/holdings/[id] — Update holding
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDB();
  const { id } = await params;
  const numericId = parseInt(id, 10);

  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { target_allocation, cost_basis, shares } = body;

    const fields: string[] = [];
    const values: (number | null)[] = [];

    if (target_allocation !== undefined) {
      fields.push("target_allocation = ?");
      values.push(target_allocation);
    }
    if (cost_basis !== undefined) {
      fields.push("cost_basis = ?");
      values.push(cost_basis);
    }
    if (shares !== undefined) {
      fields.push("shares = ?");
      values.push(shares);
    }
    fields.push("updated_at = datetime('now')");

    if (fields.length === 1) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    await db.execute({
      sql: `UPDATE portfolio_holdings SET ${fields.join(", ")} WHERE id = ?`,
      args: [...values, numericId],
    });

    const result = await db.execute({
      sql: "SELECT * FROM portfolio_holdings WHERE id = ?",
      args: [numericId],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ holding: result.rows[0] as unknown as PortfolioHolding });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/portfolio/holdings/[id] — Remove holding
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDB();
  const { id } = await params;
  const numericId = parseInt(id, 10);

  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const existing = await db.execute({
      sql: "SELECT id FROM portfolio_holdings WHERE id = ?",
      args: [numericId],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.execute({
      sql: "DELETE FROM portfolio_holdings WHERE id = ?",
      args: [numericId],
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
