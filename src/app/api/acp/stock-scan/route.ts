import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { stockScans } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === API_KEY;
}

const requestSchema = z.object({
  market: z.enum(["US", "HK", "JP", "SGX"]).default("US"),
  count: z.number().min(1).max(25).default(10),
  min_score: z.number().min(0).max(100).default(0),
});

// Map ACP market to scan market field
const MARKET_MAP: Record<string, string[]> = {
  US: ["US"],
  HK: ["HK", "HKEX"],
  JP: ["JP", "TSE"],
  SGX: ["SGX"],
};

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  
  try {
    const body = await req.json().catch(() => ({}));
    const params = requestSchema.parse(body);
    
    // Get latest unified scan from database
    const [latestScan] = await db
      .select()
      .from(stockScans)
      .where(eq(stockScans.scanType, "unified"))
      .orderBy(desc(stockScans.scannedAt))
      .limit(1);
    
    if (!latestScan) {
      return NextResponse.json({
        success: false,
        error: { code: "NO_DATA", message: "No scan data available" },
        meta: { request_id: requestId },
      }, { status: 503 });
    }

    // Parse results and filter by market
    const results = JSON.parse(latestScan.results) as Array<{
      rank: number;
      ticker: string;
      name: string;
      price: number;
      mcapB: string;
      totalScore: number;
      tier: string;
      market: string;
      growth?: { score: number; max: number; details: string[] };
      financial?: { score: number; max: number; details: string[] };
      technical?: { score: number; max: number; details: string[] };
      analyst?: { score: number; max: number; details: string[] };
    }>;

    const marketFilters = MARKET_MAP[params.market] || [params.market];
    const filtered = results
      .filter(s => marketFilters.includes(s.market))
      .filter(s => s.totalScore >= params.min_score)
      .slice(0, params.count);

    // Format for ACP output
    const picks = filtered.map((stock, idx) => ({
      rank: idx + 1,
      ticker: stock.ticker,
      name: stock.name,
      price: stock.price,
      market_cap: stock.mcapB,
      composite_score: stock.totalScore / 10, // Normalize to 0-10
      tier: stock.tier,
      scores: {
        growth: stock.growth?.score ?? 0,
        financial: stock.financial?.score ?? 0,
        technical: stock.technical?.score ?? 0,
        analyst: stock.analyst?.score ?? 0,
      },
      highlights: [
        ...(stock.growth?.details?.slice(0, 2) ?? []),
        ...(stock.technical?.details?.slice(0, 1) ?? []),
      ],
    }));

    logger.info("acp/stock-scan", `Returned ${picks.length} ${params.market} stocks from cached scan`);

    return NextResponse.json({
      success: true,
      data: {
        market: params.market,
        scan_timestamp: latestScan.scannedAt ?? new Date().toISOString(),
        total_screened: filtered.length,
        picks,
      },
      meta: {
        request_id: requestId,
        weights: {
          growth: 0.35,
          financial: 0.20,
          technical: 0.15,
          analyst: 0.10,
          insider: 0.20,
        },
        scan_source: "unified",
      },
    });
  } catch (err) {
    logger.error("acp/stock-scan", "Request failed", { error: err, requestId });
    
    if (err instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: { code: "INVALID_REQUEST", message: err.issues[0]?.message ?? "Invalid request" },
        meta: { request_id: requestId },
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Processing failed" },
      meta: { request_id: requestId },
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    endpoint: "/api/acp/stock-scan",
    method: "POST",
    description: "Get top stock picks for a market using cached scan results",
    params: {
      market: "US | HK | JP | SGX (default: US)",
      count: "Number of picks to return (1-25, default: 10)",
      min_score: "Minimum score filter (0-100, default: 0)",
    },
    pricing: "$0.20 per request",
  });
}
