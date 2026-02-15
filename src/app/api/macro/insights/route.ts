import { NextResponse } from "next/server";
import { db } from "@/db";
import { macroInsights } from "@/db/schema";
import { desc } from "drizzle-orm";

export const revalidate = 60; // Cache for 1 minute

export async function GET() {
  try {
    const [latest] = await db
      .select()
      .from(macroInsights)
      .orderBy(desc(macroInsights.generatedAt))
      .limit(1);

    if (!latest) {
      return NextResponse.json({
        insights: null,
        generatedAt: null,
        indicatorSnapshot: null,
      });
    }

    return NextResponse.json({
      insights: latest.insights,
      generatedAt: latest.generatedAt,
      indicatorSnapshot: latest.indicatorSnapshot
        ? JSON.parse(latest.indicatorSnapshot)
        : null,
    });
  } catch (error) {
    console.error("Error fetching macro insights:", error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}
