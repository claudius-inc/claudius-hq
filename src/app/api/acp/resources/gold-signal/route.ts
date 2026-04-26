import { NextRequest, NextResponse } from "next/server";
import { POST as goldSignalPost } from "../../gold-signal/route";

// Public ACP V2 Resource — gold trading signal feed.
// No client auth required. Internally uses HQ_API_KEY to invoke the
// authenticated /api/acp/gold-signal handler in-process.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lookbackDays = parseInt(searchParams.get("lookbackDays") || "365", 10);
  const detailed = searchParams.get("detailed") === "true";

  if (!process.env.HQ_API_KEY) {
    return NextResponse.json({ error: "Resource unavailable" }, { status: 503 });
  }

  const internalReq = new NextRequest(new URL("/api/acp/gold-signal", req.url), {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.HQ_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ lookbackDays, detailed }),
  });
  return goldSignalPost(internalReq);
}
