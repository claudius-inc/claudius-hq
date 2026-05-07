import { NextRequest, NextResponse } from "next/server";
import { takeMomentumSnapshot } from "@/lib/markets/momentum-gainers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await takeMomentumSnapshot();
    logger.info("momentum-snapshot", "Daily snapshot complete", result as unknown as Record<string, unknown>);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error("momentum-snapshot", "Snapshot failed", { error: e });
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
