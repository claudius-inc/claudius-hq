import { NextRequest, NextResponse } from "next/server";
import { getMomentumGainers } from "@/lib/markets/momentum-gainers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam
      ? Math.min(parseInt(limitParam, 10) || 20, 50)
      : 20;

    const gainers = await getMomentumGainers(limit);

    return NextResponse.json({
      gainers,
      count: gainers.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    logger.error("api/momentum/gainers", "Failed to fetch momentum gainers", {
      error: e,
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
