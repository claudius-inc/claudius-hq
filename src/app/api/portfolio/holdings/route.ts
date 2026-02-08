import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { PortfolioHolding } from "@/lib/types";

// GET /api/portfolio/holdings — List all holdings
export async function GET() {
  await ensureDB();
  try {
    const result = await db.execute(
      "SELECT * FROM portfolio_holdings ORDER BY target_allocation DESC"
    );
    return NextResponse.json({ holdings: result.rows as unknown as PortfolioHolding[] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/portfolio/holdings — Add holding
export async function POST(req: NextRequest) {
  await ensureDB();
  try {
    const body = await req.json();
    const { ticker, target_allocation, cost_basis, shares } = body;

    if (!ticker) {
      return NextResponse.json(
        { error: "ticker is required" },
        { status: 400 }
      );
    }

    if (target_allocation === undefined || target_allocation === null) {
      return NextResponse.json(
        { error: "target_allocation is required" },
        { status: 400 }
      );
    }

    const upperTicker = ticker.toUpperCase().trim();

    // Check if already exists
    const existing = await db.execute({
      sql: "SELECT id FROM portfolio_holdings WHERE ticker = ?",
      args: [upperTicker],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: `${upperTicker} is already in portfolio` },
        { status: 409 }
      );
    }

    const result = await db.execute({
      sql: `INSERT INTO portfolio_holdings (ticker, target_allocation, cost_basis, shares) 
            VALUES (?, ?, ?, ?)`,
      args: [
        upperTicker,
        target_allocation,
        cost_basis ?? null,
        shares ?? null,
      ],
    });

    const newHolding = await db.execute({
      sql: "SELECT * FROM portfolio_holdings WHERE id = ?",
      args: [result.lastInsertRowid!],
    });

    // Also mark the stock as graduated in watchlist if it exists
    await db.execute({
      sql: "UPDATE watchlist SET status = 'graduated', updated_at = datetime('now') WHERE ticker = ?",
      args: [upperTicker],
    });

    return NextResponse.json(
      { holding: newHolding.rows[0] as unknown as PortfolioHolding },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
