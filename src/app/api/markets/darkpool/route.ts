import { NextResponse } from "next/server";
import { db, darkpoolData } from "@/db";
import { desc, isNull, eq, and, isNotNull } from "drizzle-orm";

// Read from DB - fast response
export const revalidate = 3600; // 1 hour cache (weekly data)

interface DarkpoolSummary {
  latestWeek: string | null;
  totalAtsVolume: number;
  atsPercent: number;
  trend: "increasing" | "decreasing" | "stable";
  level: "high" | "normal" | "low";
}

export async function GET() {
  try {
    // Get aggregate weekly data (ticker IS NULL = aggregate row)
    const weeklyData = await db
      .select()
      .from(darkpoolData)
      .where(isNull(darkpoolData.ticker))
      .orderBy(desc(darkpoolData.weekEnding))
      .limit(8);
    
    // Get top tickers by dark pool volume from latest week
    const latestWeek = weeklyData[0]?.weekEnding;
    let topTickers: { ticker: string; atsVolume: number; atsPercent: number }[] = [];
    
    if (latestWeek) {
      const tickerData = await db
        .select()
        .from(darkpoolData)
        .where(and(
          eq(darkpoolData.weekEnding, latestWeek),
          isNotNull(darkpoolData.ticker)
        ))
        .orderBy(desc(darkpoolData.atsVolume))
        .limit(10);
      
      topTickers = tickerData.map(d => ({
        ticker: d.ticker!,
        atsVolume: d.atsVolume,
        atsPercent: d.atsPercent || 0,
      }));
    }
    
    // Calculate trend from weekly data
    let trend: "increasing" | "decreasing" | "stable" = "stable";
    let level: "high" | "normal" | "low" = "normal";
    
    if (weeklyData.length >= 2) {
      const current = weeklyData[0]?.atsPercent || 0;
      const previous = weeklyData[1]?.atsPercent || 0;
      const avgRecent = weeklyData.slice(0, 4).reduce((s, d) => s + (d.atsPercent || 0), 0) / Math.min(4, weeklyData.length);
      
      if (current > previous * 1.05) trend = "increasing";
      else if (current < previous * 0.95) trend = "decreasing";
      
      // Historical dark pool is ~35-45% of equity volume
      if (avgRecent > 45) level = "high";
      else if (avgRecent < 35) level = "low";
    }
    
    const summary: DarkpoolSummary = {
      latestWeek,
      totalAtsVolume: weeklyData[0]?.atsVolume || 0,
      atsPercent: weeklyData[0]?.atsPercent || 0,
      trend,
      level,
    };
    
    return NextResponse.json({
      ...summary,
      weeklyHistory: weeklyData.map(w => ({
        weekEnding: w.weekEnding,
        atsVolume: w.atsVolume,
        atsPercent: w.atsPercent,
      })),
      topTickers,
      source: "FINRA ATS (synced)",
      note: "Weekly dark pool / ATS trading volume data",
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Darkpool GET error:", e);
    return NextResponse.json({
      latestWeek: null,
      totalAtsVolume: 0,
      atsPercent: 0,
      trend: "stable",
      level: "normal",
      weeklyHistory: [],
      topTickers: [],
      source: "database",
      error: "Failed to fetch dark pool data",
      updatedAt: new Date().toISOString(),
    });
  }
}
