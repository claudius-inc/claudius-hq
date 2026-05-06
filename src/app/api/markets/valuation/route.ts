import { NextResponse } from "next/server";
import { fetchValuationData } from "@/lib/markets/market-valuation";

export async function GET() {
  try {
    const data = await fetchValuationData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching valuations:", error);
    return NextResponse.json(
      { error: "Failed to fetch valuations" },
      { status: 500 }
    );
  }
}
