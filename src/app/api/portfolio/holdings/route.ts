import { NextRequest, NextResponse } from "next/server";
import { db, portfolioHoldings, watchlist } from "@/db";
import { eq, desc } from "drizzle-orm";

// GET /api/portfolio/holdings — List all holdings
export async function GET() {
  try {
    const holdings = await db
      .select()
      .from(portfolioHoldings)
      .orderBy(desc(portfolioHoldings.targetAllocation));
    
    return NextResponse.json({ holdings });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/portfolio/holdings — Add holding
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, target_allocation, cost_basis, shares } = body;

    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 });
    }

    if (target_allocation === undefined || target_allocation === null) {
      return NextResponse.json({ error: "target_allocation is required" }, { status: 400 });
    }

    const upperTicker = ticker.toUpperCase().trim();

    // Check if already exists
    const [existing] = await db
      .select({ id: portfolioHoldings.id })
      .from(portfolioHoldings)
      .where(eq(portfolioHoldings.ticker, upperTicker));

    if (existing) {
      return NextResponse.json(
        { error: `${upperTicker} is already in portfolio` },
        { status: 409 }
      );
    }

    const [newHolding] = await db
      .insert(portfolioHoldings)
      .values({
        ticker: upperTicker,
        targetAllocation: target_allocation,
        costBasis: cost_basis ?? null,
        shares: shares ?? null,
      })
      .returning();

    // Also mark the stock as graduated in watchlist if it exists
    await db
      .update(watchlist)
      .set({
        status: "graduated",
        updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      })
      .where(eq(watchlist.ticker, upperTicker));

    return NextResponse.json({ holding: newHolding }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
