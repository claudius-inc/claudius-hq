import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marketReference } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/markets/reference/[symbol] - Get single symbol
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const normalizedSymbol = symbol.toUpperCase();
    
    const ref = await db
      .select()
      .from(marketReference)
      .where(eq(marketReference.symbol, normalizedSymbol))
      .get();
    
    if (!ref) {
      return NextResponse.json(
        { error: `Symbol '${normalizedSymbol}' not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      data: {
        ...ref,
        keyThresholds: ref.keyThresholds ? JSON.parse(ref.keyThresholds) : null,
      },
    });
  } catch (error) {
    console.error("Error fetching market reference:", error);
    return NextResponse.json(
      { error: "Failed to fetch market reference" },
      { status: 500 }
    );
  }
}
