import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { fetchThemesLite } from "@/lib/themes";

// GET /api/themes/lite - Fast theme list (no price fetching)
// Returns theme metadata + stock lists from DB only
export async function GET() {
  try {
    const data = await fetchThemesLite();

    return NextResponse.json(
      data,
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    logger.error("api/themes/lite", "Failed to get themes", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
