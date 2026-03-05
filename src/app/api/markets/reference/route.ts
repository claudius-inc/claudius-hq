import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marketReference } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/markets/reference - List all reference data
export async function GET() {
  try {
    const references = await db.select().from(marketReference).all();
    
    // Parse JSON fields
    const parsed = references.map(ref => ({
      ...ref,
      keyThresholds: ref.keyThresholds ? JSON.parse(ref.keyThresholds) : null,
    }));
    
    return NextResponse.json({
      data: parsed,
      count: parsed.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching market references:", error);
    return NextResponse.json(
      { error: "Failed to fetch market references" },
      { status: 500 }
    );
  }
}

// POST /api/markets/reference - Create or update reference (upsert by symbol)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      symbol,
      name,
      yahooTicker,
      athPrice,
      athDate,
      currentPrice,
      keyThresholds,
      notes,
    } = body;
    
    if (!symbol || !name) {
      return NextResponse.json(
        { error: "symbol and name are required" },
        { status: 400 }
      );
    }
    
    const normalizedSymbol = symbol.toUpperCase();
    
    // Check if exists
    const existing = await db
      .select()
      .from(marketReference)
      .where(eq(marketReference.symbol, normalizedSymbol))
      .get();
    
    const thresholdsJson = keyThresholds
      ? JSON.stringify(keyThresholds)
      : null;
    
    if (existing) {
      // Update
      await db
        .update(marketReference)
        .set({
          name,
          yahooTicker: yahooTicker ?? existing.yahooTicker,
          athPrice: athPrice ?? existing.athPrice,
          athDate: athDate ?? existing.athDate,
          currentPrice: currentPrice ?? existing.currentPrice,
          keyThresholds: thresholdsJson ?? existing.keyThresholds,
          notes: notes ?? existing.notes,
          updatedAt: sql`(datetime('now'))`,
        })
        .where(eq(marketReference.symbol, normalizedSymbol))
        .run();
      
      const updated = await db
        .select()
        .from(marketReference)
        .where(eq(marketReference.symbol, normalizedSymbol))
        .get();
      
      return NextResponse.json({
        action: "updated",
        data: {
          ...updated,
          keyThresholds: updated?.keyThresholds ? JSON.parse(updated.keyThresholds) : null,
        },
      });
    } else {
      // Insert
      await db.insert(marketReference).values({
        symbol: normalizedSymbol,
        name,
        yahooTicker,
        athPrice,
        athDate,
        currentPrice,
        keyThresholds: thresholdsJson,
        notes,
      }).run();
      
      const inserted = await db
        .select()
        .from(marketReference)
        .where(eq(marketReference.symbol, normalizedSymbol))
        .get();
      
      return NextResponse.json({
        action: "created",
        data: {
          ...inserted,
          keyThresholds: inserted?.keyThresholds ? JSON.parse(inserted.keyThresholds) : null,
        },
      }, { status: 201 });
    }
  } catch (error) {
    console.error("Error upserting market reference:", error);
    return NextResponse.json(
      { error: "Failed to upsert market reference" },
      { status: 500 }
    );
  }
}
