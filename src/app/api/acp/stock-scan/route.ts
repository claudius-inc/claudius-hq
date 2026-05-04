import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, watchlistScores, themes } from "@/db";
import { desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

const requestSchema = z
  .object({
    market: z.string().toUpperCase().optional()
      .transform((v) => v ?? "ALL")
      .pipe(z.enum(["US", "SGX", "HK", "JP", "KS", "CN", "ALL"])),
    min_momentum: z.number().min(0).max(100).default(0),
    limit: z.number().min(1).max(100).default(50),
  })
  .passthrough(); // ignore unknown fields (e.g. legacy `enhanced`)

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const params = requestSchema.parse(body);

    const [scoreRows, themeRows] = await Promise.all([
      db.select().from(watchlistScores).orderBy(desc(watchlistScores.momentumScore)),
      db.select({ id: themes.id, name: themes.name }).from(themes),
    ]);

    const themeNameById = new Map(themeRows.map((t) => [t.id, t.name]));

    let filtered = scoreRows.filter((r) => (r.momentumScore ?? -1) >= params.min_momentum);
    if (params.market !== "ALL") {
      filtered = filtered.filter((r) => r.market === params.market);
    }
    filtered = filtered.slice(0, params.limit);

    const picks = filtered.map((r) => {
      let themeIds: number[] = [];
      try {
        themeIds = JSON.parse(r.themeIds);
      } catch {
        /* ignore */
      }
      return {
        ticker: r.ticker,
        name: r.name,
        market: r.market,
        price: r.price,
        momentum_score: r.momentumScore,
        technical_score: r.technicalScore,
        change_1w: r.priceChange1w,
        change_1m: r.priceChange1m,
        change_3m: r.priceChange3m,
        description: r.description,
        themes: themeIds.map((id) => themeNameById.get(id) ?? `#${id}`),
        data_quality: r.dataQuality,
      };
    });

    const lastComputedAt = scoreRows.length > 0
      ? scoreRows.reduce((max, r) => (r.computedAt > max ? r.computedAt : max), scoreRows[0].computedAt)
      : new Date().toISOString();

    return NextResponse.json({
      success: true,
      data: {
        scan_timestamp: lastComputedAt,
        count: picks.length,
        picks,
      },
      meta: {
        request_id: requestId,
        processing_time_ms: Date.now() - startTime,
        pricing: "$0.20 per request",
      },
    });
  } catch (err) {
    logger.error("acp/stock-scan", "Request failed", { error: err, requestId });
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_REQUEST", message: err.issues[0]?.message ?? "Invalid request" },
          meta: { request_id: requestId },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Processing failed" },
        meta: { request_id: requestId },
      },
      { status: 500 },
    );
  }
}

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    endpoint: "/api/acp/stock-scan",
    method: "POST",
    description: "Returns the Claudius watchlist of theme-tracked tickers with momentum and technical scores.",
    version: "3.0",
    params: {
      market: "US | SGX | HK | JP | KS | CN | ALL (default: ALL)",
      min_momentum: "Minimum momentum score 0-100 (default: 0)",
      limit: "Max results, 1-100 (default: 50)",
    },
    pricing: "$0.20 per request",
    response_fields: ["ticker", "name", "market", "price", "momentum_score", "technical_score", "change_1w", "change_1m", "change_3m", "themes", "data_quality"],
    methodology: {
      momentum_score: "0-100; weighted blend of 12-1M return (40), 52w range position (25), trend persistence (20), distance above 200-SMA (15)",
      technical_score: "0-100; weighted blend of MA stack (30), RSI (25), MACD (20), volume trend (15), ADX (10)",
    },
  });
}
