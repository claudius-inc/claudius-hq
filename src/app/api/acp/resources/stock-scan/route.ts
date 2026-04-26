import { NextRequest, NextResponse } from "next/server";
import { POST as stockScanPost } from "../../stock-scan/route";

// Public ACP V2 Resource — multi-market equity scan feed.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") || "US").toUpperCase();
  const count = Math.min(parseInt(searchParams.get("count") || "10", 10), 25);

  if (!process.env.HQ_API_KEY) {
    return NextResponse.json({ error: "Resource unavailable" }, { status: 503 });
  }

  const internalReq = new NextRequest(new URL("/api/acp/stock-scan", req.url), {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.HQ_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ market, count }),
  });
  return stockScanPost(internalReq);
}
