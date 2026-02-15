import { NextResponse } from "next/server";
import { db } from "@/db";
import { analystCalls, analysts } from "@/db/schema";
import { desc, eq, like, and, sql } from "drizzle-orm";

// GET /api/analysts/calls - List all calls, filterable
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const analystId = searchParams.get("analystId");
    const ticker = searchParams.get("ticker");
    const action = searchParams.get("action");
    const limit = parseInt(searchParams.get("limit") || "50");

    const conditions = [];
    if (analystId) {
      conditions.push(eq(analystCalls.analystId, parseInt(analystId)));
    }
    if (ticker) {
      conditions.push(like(analystCalls.ticker, `%${ticker.toUpperCase()}%`));
    }
    if (action) {
      conditions.push(eq(analystCalls.action, action));
    }

    // Join with analysts to get analyst name
    const calls = await db
      .select({
        id: analystCalls.id,
        analystId: analystCalls.analystId,
        analystName: analysts.name,
        analystFirm: analysts.firm,
        ticker: analystCalls.ticker,
        action: analystCalls.action,
        priceTarget: analystCalls.priceTarget,
        priceAtCall: analystCalls.priceAtCall,
        currentPrice: analystCalls.currentPrice,
        callDate: analystCalls.callDate,
        notes: analystCalls.notes,
        outcome: analystCalls.outcome,
        createdAt: analystCalls.createdAt,
      })
      .from(analystCalls)
      .leftJoin(analysts, eq(analystCalls.analystId, analysts.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(analystCalls.callDate))
      .limit(limit);

    return NextResponse.json({ calls });
  } catch (error) {
    console.error("Failed to fetch calls:", error);
    return NextResponse.json(
      { error: "Failed to fetch calls" },
      { status: 500 }
    );
  }
}

// POST /api/analysts/calls - Add new call
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      analystId,
      ticker,
      action,
      priceTarget,
      priceAtCall,
      currentPrice,
      callDate,
      notes,
      outcome,
    } = body;

    if (!analystId || !ticker || !action || !callDate) {
      return NextResponse.json(
        { error: "analystId, ticker, action, and callDate are required" },
        { status: 400 }
      );
    }

    const [newCall] = await db
      .insert(analystCalls)
      .values({
        analystId: parseInt(analystId),
        ticker: ticker.toUpperCase().trim(),
        action,
        priceTarget: priceTarget ? parseFloat(priceTarget) : null,
        priceAtCall: priceAtCall ? parseFloat(priceAtCall) : null,
        currentPrice: currentPrice ? parseFloat(currentPrice) : null,
        callDate,
        notes: notes || null,
        outcome: outcome || "pending",
      })
      .returning();

    return NextResponse.json({ call: newCall });
  } catch (error) {
    console.error("Failed to create call:", error);
    return NextResponse.json(
      { error: "Failed to create call" },
      { status: 500 }
    );
  }
}
