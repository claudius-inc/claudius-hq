import { NextResponse } from "next/server";
import { db } from "@/db";
import { analysts, analystCalls } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

// GET /api/analysts - List all analysts with their recent calls
export async function GET() {
  try {
    // Get all analysts
    const allAnalysts = await db
      .select()
      .from(analysts)
      .orderBy(desc(analysts.successRate));

    // Get call counts per analyst
    const callCounts = await db
      .select({
        analystId: analystCalls.analystId,
        count: sql<number>`count(*)`,
      })
      .from(analystCalls)
      .groupBy(analystCalls.analystId);

    // Get recent calls for each analyst (last 5)
    const recentCalls = await db
      .select()
      .from(analystCalls)
      .orderBy(desc(analystCalls.callDate))
      .limit(100);

    // Combine data
    const enrichedAnalysts = allAnalysts.map((analyst) => {
      const count = callCounts.find((c) => c.analystId === analyst.id);
      const calls = recentCalls
        .filter((c) => c.analystId === analyst.id)
        .slice(0, 5);

      return {
        ...analyst,
        callCount: count?.count || 0,
        recentCalls: calls,
      };
    });

    return NextResponse.json({ analysts: enrichedAnalysts });
  } catch (error) {
    console.error("Failed to fetch analysts:", error);
    return NextResponse.json(
      { error: "Failed to fetch analysts" },
      { status: 500 }
    );
  }
}

// POST /api/analysts - Add new analyst
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, firm, specialty, successRate, avgReturn, notes } = body;

    if (!name || !firm) {
      return NextResponse.json(
        { error: "Name and firm are required" },
        { status: 400 }
      );
    }

    const [newAnalyst] = await db
      .insert(analysts)
      .values({
        name,
        firm,
        specialty: specialty || null,
        successRate: successRate ? parseFloat(successRate) : null,
        avgReturn: avgReturn ? parseFloat(avgReturn) : null,
        notes: notes || null,
      })
      .returning();

    return NextResponse.json({ analyst: newAnalyst });
  } catch (error) {
    console.error("Failed to create analyst:", error);
    return NextResponse.json(
      { error: "Failed to create analyst" },
      { status: 500 }
    );
  }
}
