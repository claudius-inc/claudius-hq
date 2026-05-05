import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// POST /api/social/sync — triggers tweet fetch on VPS, returns new tweet count
export async function POST(_request: NextRequest) {
  try {
    const apiKey = process.env.HQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch("http://46.225.234.206:3457/sync", {
      method: "POST",
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.error("api/social/sync", `VPS sync failed: ${res.status}`, { body: text });
      return NextResponse.json({ error: "Sync failed", new_tweets: 0 }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    logger.error("api/social/sync", "Sync request failed", { error: e });
    return NextResponse.json(
      { error: e instanceof Error && e.name === "AbortError" ? "Sync timed out" : "Sync failed", new_tweets: 0 },
      { status: 504 }
    );
  }
}
