import { NextRequest, NextResponse } from "next/server";
import { POST as altPicksPost } from "../../alt-picks/route";

// Public ACP V2 Resource — altcoin scan feed.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const count = parseInt(searchParams.get("count") || "10", 10);
  const category = searchParams.get("category");
  const minMarketCap = parseInt(searchParams.get("min_market_cap") || "10000000", 10);

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.HQ_API_KEY) {
    headers.authorization = `Bearer ${process.env.HQ_API_KEY}`;
  }

  const internalReq = new NextRequest(new URL("/api/acp/alt-picks", req.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ count, category, min_market_cap: minMarketCap }),
  });
  return altPicksPost(internalReq);
}
