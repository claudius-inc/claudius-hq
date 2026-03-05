/**
 * Seed script for market_reference table
 * Run with: npx tsx scripts/seed-market-reference.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { marketReference } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

interface SeedData {
  symbol: string;
  name: string;
  yahooTicker: string;
  athPrice: number | null;
  athDate: string | null;
  keyThresholds: Record<string, number | string> | null;
  notes: string | null;
}

const seedData: SeedData[] = [
  {
    symbol: "GOLD",
    name: "Gold",
    yahooTicker: "GC=F",
    athPrice: 5589,
    athDate: "2026-01-28",
    keyThresholds: {
      buy_zone: 4800,
    },
    notes: "Safe haven, rallies on geopolitical risk. Central banks accumulating.",
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    yahooTicker: "BTC-USD",
    athPrice: 109000,
    athDate: "2025-01-20",
    keyThresholds: {
      halving_cycle: "2024-04 halving, historically peaks 12-18 months after",
    },
    notes: "Digital gold narrative. Institutional adoption accelerating via ETFs.",
  },
  {
    symbol: "SPX",
    name: "S&P 500",
    yahooTicker: "^GSPC",
    athPrice: 7002,
    athDate: "2025-02-19",
    keyThresholds: {
      correction_10pct: 6302,
      bear_market_20pct: 5602,
    },
    notes: "-10% = correction (buy zone), -20% = bear market. Valuations stretched but earnings supportive.",
  },
  {
    symbol: "VIX",
    name: "CBOE Volatility Index",
    yahooTicker: "^VIX",
    athPrice: null,
    athDate: null,
    keyThresholds: {
      normal: 15,
      elevated: 25,
      fear: 40,
      panic: 50,
    },
    notes: ">25 elevated, >40 fear, >50 panic buying opportunity. Mean-reverting — spikes are opportunities.",
  },
  {
    symbol: "OIL",
    name: "Brent Crude Oil",
    yahooTicker: "BZ=F",
    athPrice: null,
    athDate: null,
    keyThresholds: {
      bullish_below: 75,
      demand_destruction: 100,
    },
    notes: "<$75 bullish for consumers/equities, >$100 demand destruction risk. OPEC+ supply management key.",
  },
];

async function seed() {
  console.log("Seeding market_reference table...\n");
  
  for (const data of seedData) {
    // Check if exists
    const existing = await db
      .select()
      .from(marketReference)
      .where(eq(marketReference.symbol, data.symbol))
      .get();
    
    if (existing) {
      // Update
      await db
        .update(marketReference)
        .set({
          name: data.name,
          yahooTicker: data.yahooTicker,
          athPrice: data.athPrice,
          athDate: data.athDate,
          keyThresholds: data.keyThresholds ? JSON.stringify(data.keyThresholds) : null,
          notes: data.notes,
          updatedAt: sql`(datetime('now'))`,
        })
        .where(eq(marketReference.symbol, data.symbol))
        .run();
      console.log(`✓ Updated: ${data.symbol} (${data.name})`);
    } else {
      // Insert
      await db.insert(marketReference).values({
        symbol: data.symbol,
        name: data.name,
        yahooTicker: data.yahooTicker,
        athPrice: data.athPrice,
        athDate: data.athDate,
        keyThresholds: data.keyThresholds ? JSON.stringify(data.keyThresholds) : null,
        notes: data.notes,
      }).run();
      console.log(`✓ Created: ${data.symbol} (${data.name})`);
    }
  }
  
  console.log("\n✅ Seed complete!");
  
  // List all
  const all = await db.select().from(marketReference).all();
  console.log(`\nTotal records: ${all.length}`);
  for (const ref of all) {
    console.log(`  - ${ref.symbol}: ${ref.name} (ticker: ${ref.yahooTicker})`);
  }
}

seed().catch(console.error);
