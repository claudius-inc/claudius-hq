import { NextResponse } from "next/server";
import { fetchRegimePanelData } from "@/lib/regime-panel";

// Cache for 15 minutes
export const revalidate = 900;

export async function GET(): Promise<NextResponse> {
  const data = await fetchRegimePanelData();
  if (!data) {
    return NextResponse.json(
      { error: "Failed to fetch regime data" },
      { status: 500 },
    );
  }
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
    },
  });
}
