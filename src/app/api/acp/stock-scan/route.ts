import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { stockScans } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { 
  fetchEnhancedMetrics, 
  getSectorRotationContext,
  getMarketCapTier,
  type EnhancedStockMetrics 
} from "@/lib/scanner/enhanced-metrics";

const requestSchema = z.object({
  market: z.string().transform(s => s.toUpperCase()).pipe(z.enum(["US", "HK", "JP", "SGX"])).default("US"),
  count: z.number().min(1).max(25).default(10),
  min_score: z.number().min(0).max(100).default(0),
  // Enhanced mode fetches live institutional data (slower but more complete)
  enhanced: z.boolean().default(false),
  // Filter by sector type
  sector_type: z.enum(["cyclical", "defensive", "growth", "all"]).default("all"),
  // Filter by market cap tier
  cap_tier: z.enum(["mega", "large", "mid", "small", "all"]).default("all"),
});

// Map ACP market to scan market field
const MARKET_MAP: Record<string, string[]> = {
  US: ["US"],
  HK: ["HK", "HKEX"],
  JP: ["JP", "TSE"],
  SGX: ["SGX"],
};

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();
  
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
      insider?: { score: number; max: number; details: string[] };
      compositeScore?: number;
      fundamentalScore?: number;
      technicalScore?: number;
      momentumScore?: number;
    }>;

    const marketFilters = MARKET_MAP[params.market] || [params.market];
    let filtered = results
      .filter(s => marketFilters.includes(s.market))
      .filter(s => s.totalScore >= params.min_score);

    // Parse mcapB to filter by tier
    if (params.cap_tier !== "all") {
      filtered = filtered.filter(s => {
        const mcapB = parseFloat(s.mcapB.replace(/[^0-9.]/g, "")) || 0;
        const { tier } = getMarketCapTier(mcapB);
        return tier === params.cap_tier;
      });
    }

    // Slice to requested count (before enhancement to limit API calls)
    filtered = filtered.slice(0, params.count);

    // Enhanced mode: fetch live institutional data
    let enhancedDataMap = new Map<string, EnhancedStockMetrics>();
    if (params.enhanced && filtered.length > 0) {
      logger.info("acp/stock-scan", `Fetching enhanced data for ${filtered.length} stocks`);
      
      // Fetch enhanced metrics for each stock (with rate limiting)
      for (const stock of filtered) {
        try {
          const mcapB = parseFloat(stock.mcapB.replace(/[^0-9.]/g, "")) || 0;
          const enhanced = await fetchEnhancedMetrics(stock.ticker, stock.price, mcapB);
          if (enhanced) {
            // Apply sector filter if specified
            if (params.sector_type !== "all" && enhanced.sectorType !== params.sector_type) {
              continue;
            }
            enhancedDataMap.set(stock.ticker, enhanced);
          }
        } catch (e) {
          logger.warn("acp/stock-scan", `Enhanced fetch failed for ${stock.ticker}`, { error: e });
        }
      }
      
      // Re-filter based on sector type if enhanced mode
      if (params.sector_type !== "all") {
        filtered = filtered.filter(s => enhancedDataMap.has(s.ticker));
      }
    }

    // Format for ACP output
    const picks = filtered.map((stock, idx) => {
      const mcapB = parseFloat(stock.mcapB.replace(/[^0-9.]/g, "")) || 0;
      const { tier: marketCapTier, label: marketCapLabel } = getMarketCapTier(mcapB);
      const enhanced = enhancedDataMap.get(stock.ticker);
      
      const basePick = {
        rank: idx + 1,
        ticker: stock.ticker,
        name: stock.name,
        price: stock.price,
        market_cap: stock.mcapB,
        market_cap_tier: marketCapTier,
        market_cap_label: marketCapLabel,
        composite_score: (stock.compositeScore ?? stock.totalScore) / 10, // Normalize to 0-10
        tier: stock.tier,
        scores: {
          growth: stock.growth?.score ?? 0,
          financial: stock.financial?.score ?? 0,
          technical: stock.technical?.score ?? 0,
          analyst: stock.analyst?.score ?? 0,
          fundamental: stock.compositeScore ? Math.round((stock.fundamentalScore ?? 0) / 10) : null,
          momentum: stock.compositeScore ? Math.round((stock.momentumScore ?? 0) / 10) : null,
        },
        highlights: [
          ...(stock.growth?.details?.slice(0, 2) ?? []),
          ...(stock.technical?.details?.slice(0, 1) ?? []),
        ],
      };
      
      // Add enhanced data if available
      if (enhanced) {
        return {
          ...basePick,
          // Sector rotation
          sector: enhanced.sector,
          sector_type: enhanced.sectorType,
          sector_rotation: getSectorRotationContext(enhanced.sectorType),
          industry: enhanced.industry,
          
          // Fundamental quality
          fundamentals: {
            fcf_yield: enhanced.fcfYield,
            roic: enhanced.roic,
            debt_to_equity: enhanced.debtToEquity,
            current_ratio: enhanced.currentRatio,
          },
          
          // Earnings surprise
          earnings: {
            surprises: enhanced.earningsSurprises.slice(0, 4),
            avg_surprise_pct: enhanced.avgEarningsSurprise,
            consecutive_beats: enhanced.consecutiveBeats,
          },
          
          // Ownership structure
          ownership: {
            institutional_pct: enhanced.institutionalOwnership,
            insider_pct: enhanced.insiderOwnership,
            short_interest_pct: enhanced.shortPercentFloat,
          },
          
          // Analyst consensus
          analyst_consensus: {
            rating: enhanced.analystRating.label,
            mean_score: enhanced.analystRating.mean,
            distribution: {
              strong_buy: enhanced.analystRating.strongBuy,
              buy: enhanced.analystRating.buy,
              hold: enhanced.analystRating.hold,
              sell: enhanced.analystRating.sell,
              strong_sell: enhanced.analystRating.strongSell,
            },
            target_price: enhanced.analystRating.targetPrice,
            target_upside_pct: enhanced.analystRating.targetUpside,
            coverage_count: enhanced.analystRating.total,
          },
          
          // Relative strength vs SPY
          relative_strength: {
            vs_spy_1m: enhanced.relativeStrength.vs1m,
            vs_spy_3m: enhanced.relativeStrength.vs3m,
            vs_spy_6m: enhanced.relativeStrength.vs6m,
            rating: enhanced.relativeStrength.rating,
          },
          
          // Price momentum
          momentum: {
            change_1m: enhanced.priceChange1m,
            change_3m: enhanced.priceChange3m,
            change_6m: enhanced.priceChange6m,
            change_ytd: enhanced.priceChangeYTD,
            high_52w: enhanced.fiftyTwoWeekHigh,
            low_52w: enhanced.fiftyTwoWeekLow,
            pct_from_high: enhanced.percentFromHigh,
          },
          
          // Quality signals
          quality_flags: enhanced.qualityFlags,
          risk_flags: enhanced.riskFlags,
        };
      }
      
      return basePick;
    });

    const processingTime = Date.now() - startTime;
    logger.info("acp/stock-scan", `Returned ${picks.length} ${params.market} stocks${params.enhanced ? " (enhanced)" : ""} in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      data: {
        market: params.market,
        scan_timestamp: latestScan.scannedAt ?? new Date().toISOString(),
        total_screened: filtered.length,
        enhanced_mode: params.enhanced,
        filters_applied: {
          sector_type: params.sector_type,
          cap_tier: params.cap_tier,
          min_score: params.min_score,
        },
        picks,
      },
      meta: {
        request_id: requestId,
        processing_time_ms: processingTime,
        weights: {
          growth: 0.35,
          financial: 0.20,
          technical: 0.15,
          analyst: 0.10,
          insider: 0.20,
        },
        scan_source: "unified",
        methodology: {
          composite_score: "Weighted blend of growth, financial health, technical, analyst, and insider signals (0-10 scale)",
          sector_rotation: "Stocks classified as cyclical, defensive, or growth based on GICS sector",
          relative_strength: "Performance vs SPY benchmark over 1m/3m/6m horizons",
          earnings_surprise: "Actual vs estimated EPS for last 4 quarters",
          ownership: "Institutional and insider holdings from latest filings",
        },
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
    description: "Get top stock picks for a market with institutional-grade data",
    version: "2.0",
    params: {
      market: "US | HK | JP | SGX (default: US)",
      count: "Number of picks to return (1-25, default: 10)",
      min_score: "Minimum score filter (0-100, default: 0)",
      enhanced: "Fetch live institutional data: ownership, earnings, analyst consensus (default: false)",
      sector_type: "Filter by sector type: cyclical | defensive | growth | all (default: all)",
      cap_tier: "Filter by market cap: mega | large | mid | small | all (default: all)",
    },
    pricing: "$0.20 per request",
    response_fields: {
      basic: ["rank", "ticker", "name", "price", "market_cap", "composite_score", "tier", "scores", "highlights"],
      enhanced: [
        "sector / sector_type / sector_rotation (cyclical/defensive/growth context)",
        "fundamentals (FCF yield, ROIC, debt ratios)",
        "earnings (surprise history, consecutive beats)",
        "ownership (institutional %, insider %, short interest)",
        "analyst_consensus (rating distribution, target price, upside)",
        "relative_strength (vs SPY 1m/3m/6m)",
        "momentum (price changes, 52w high/low)",
        "quality_flags / risk_flags",
      ],
    },
  });
}
