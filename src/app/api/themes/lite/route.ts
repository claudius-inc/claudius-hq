import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { fetchThemesLite } from "@/lib/themes";

// GET /api/themes/lite - Fast theme list (no price fetching)
// Returns theme metadata + stock lists from DB only
// No server cache — always fresh from DB. Client can still cache via SWR.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchThemesLite();

    return NextResponse.json(data);
  } catch (e) {
    logger.error("api/themes/lite", "Failed to get themes", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
