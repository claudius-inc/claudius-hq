import { NextResponse } from "next/server";
import { db } from "@/db";
import { silverStocks } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface SilverResponse {
  latest: {
    activityDate: string;
    reportDate: string;
    registeredOz: number;
    eligibleOz: number;
    totalOz: number;
    registeredMoz: number; // In millions for display
    eligibleMoz: number;
    totalMoz: number;
  } | null;
  change30d: {
    registeredOz: number;
    registeredPercent: number;
    eligibleOz: number;
    eligiblePercent: number;
  } | null;
  history: {
    activityDate: string;
    registeredMoz: number;
    eligibleMoz: number;
  }[];
  stressLevel: "low" | "moderate" | "high" | "critical";
  source: string;
}

function getStressLevel(registeredOz: number): SilverResponse["stressLevel"] {
  // Stress levels based on COMEX registered silver
  // Historical context: 2021 low was ~30M oz during squeeze
  if (registeredOz < 50_000_000) return "critical"; // <50M oz
  if (registeredOz < 80_000_000) return "high";      // <80M oz  
  if (registeredOz < 120_000_000) return "moderate"; // <120M oz
  return "low"; // >120M oz
}

export async function GET() {
  try {
    // Get last 90 days of data for history
    const history = await db
      .select()
      .from(silverStocks)
      .orderBy(desc(silverStocks.activityDate))
      .limit(90);
    
    if (history.length === 0) {
      return NextResponse.json({
        latest: null,
        change30d: null,
        history: [],
        stressLevel: "moderate",
        source: "CME Group COMEX Silver Stocks (no data)",
      } satisfies SilverResponse);
    }
    
    const latest = history[0];
    
    // Calculate 30-day change
    let change30d: SilverResponse["change30d"] = null;
    
    // Find data from ~30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];
    
    // Find closest record to 30 days ago
    const olderRecord = history.find(h => h.activityDate <= thirtyDaysAgoStr);
    
    if (olderRecord) {
      const regChange = latest.registeredOz - olderRecord.registeredOz;
      const eligChange = latest.eligibleOz - olderRecord.eligibleOz;
      
      change30d = {
        registeredOz: regChange,
        registeredPercent: olderRecord.registeredOz > 0 
          ? (regChange / olderRecord.registeredOz) * 100 
          : 0,
        eligibleOz: eligChange,
        eligiblePercent: olderRecord.eligibleOz > 0 
          ? (eligChange / olderRecord.eligibleOz) * 100 
          : 0,
      };
    }
    
    const response: SilverResponse = {
      latest: {
        activityDate: latest.activityDate,
        reportDate: latest.reportDate,
        registeredOz: latest.registeredOz,
        eligibleOz: latest.eligibleOz,
        totalOz: latest.totalOz,
        registeredMoz: Math.round(latest.registeredOz / 1_000_000 * 10) / 10,
        eligibleMoz: Math.round(latest.eligibleOz / 1_000_000 * 10) / 10,
        totalMoz: Math.round(latest.totalOz / 1_000_000 * 10) / 10,
      },
      change30d,
      history: history.reverse().map(h => ({
        activityDate: h.activityDate,
        registeredMoz: Math.round(h.registeredOz / 1_000_000 * 10) / 10,
        eligibleMoz: Math.round(h.eligibleOz / 1_000_000 * 10) / 10,
      })),
      stressLevel: getStressLevel(latest.registeredOz),
      source: "CME Group COMEX Silver Stocks",
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error("Silver API error:", error);
    return NextResponse.json({ 
      error: "Failed to fetch silver data" 
    }, { status: 500 });
  }
}
