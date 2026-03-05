import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// ISR - revalidate every 15 minutes
export const revalidate = 900;

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface BreadthData {
  advanceDecline: {
    advances: number | null;
    declines: number | null;
    unchanged: number | null;
    ratio: number | null;
    netAdvances: number | null;
  };
  newHighsLows: {
    newHighs: number | null;
    newLows: number | null;
    ratio: number | null;
    netHighs: number | null;
  };
  level: "bullish" | "neutral" | "bearish";
  interpretation: string;
}

// Fetch market breadth from major indices components
async function fetchBreadthFromIndex(): Promise<BreadthData> {
  try {
    // Use SPY as a proxy - fetch market movers/trending
    // Yahoo Finance doesn't have direct A/D line symbols, so we estimate from market data
    
    // Alternative approach: fetch summary market data
    const [spyQuote, qqqQuote, iwmQuote] = await Promise.all([
      yahooFinance.quote("SPY"),
      yahooFinance.quote("QQQ"),
      yahooFinance.quote("IWM"),
    ]);
    
    // Get market summary for NYSE
    let advances = null;
    let declines = null;
    let newHighs = null;
    let newLows = null;
    
    try {
      // Try to get market summary with breadth data
      const marketSummary = await yahooFinance.quoteSummary("^GSPC", { modules: ["summaryDetail", "price"] });
      // Note: Yahoo doesn't provide A/D directly in most cases
    } catch {
      // Fallback: estimate from ETF performance
    }
    
    // Estimate breadth from broad market ETFs
    // If major indices are up, breadth is likely positive
    const spyChange = (spyQuote as { regularMarketChangePercent?: number })?.regularMarketChangePercent || 0;
    const qqqChange = (qqqQuote as { regularMarketChangePercent?: number })?.regularMarketChangePercent || 0;
    const iwmChange = (iwmQuote as { regularMarketChangePercent?: number })?.regularMarketChangePercent || 0;
    
    // Small caps (IWM) vs large caps (SPY) divergence signals breadth
    const breadthSignal = iwmChange - spyChange;
    
    // Estimate A/D based on market performance
    // This is approximate - real A/D would need NYSE data feed
    const avgChange = (spyChange + qqqChange + iwmChange) / 3;
    
    if (avgChange > 0.5) {
      advances = Math.round(2000 + avgChange * 200);
      declines = Math.round(1200 - avgChange * 100);
    } else if (avgChange < -0.5) {
      advances = Math.round(1200 + avgChange * 100);
      declines = Math.round(2000 - avgChange * 200);
    } else {
      advances = 1600;
      declines = 1600;
    }
    
    // Estimate new highs/lows
    if (avgChange > 1) {
      newHighs = Math.round(100 + avgChange * 30);
      newLows = Math.round(20 - avgChange * 5);
    } else if (avgChange < -1) {
      newHighs = Math.round(20 + avgChange * 5);
      newLows = Math.round(100 - avgChange * 30);
    } else {
      newHighs = 50;
      newLows = 50;
    }
    
    const adRatio = declines > 0 ? advances / declines : advances > 0 ? 2 : 1;
    const hlRatio = newLows > 0 ? newHighs / newLows : newHighs > 0 ? 2 : 1;
    
    // Determine overall level
    let level: "bullish" | "neutral" | "bearish";
    let interpretation: string;
    
    if (adRatio > 1.5 && hlRatio > 1.5) {
      level = "bullish";
      interpretation = "Strong breadth - broad market participation in rally";
    } else if (adRatio < 0.7 || hlRatio < 0.5) {
      level = "bearish";
      interpretation = "Weak breadth - selling pressure widespread";
    } else if (breadthSignal > 1) {
      level = "bullish";
      interpretation = "Small caps leading - risk-on breadth";
    } else if (breadthSignal < -1) {
      level = "bearish";
      interpretation = "Large caps leading - narrow market, defensive breadth";
    } else {
      level = "neutral";
      interpretation = "Mixed breadth signals";
    }
    
    return {
      advanceDecline: {
        advances,
        declines,
        unchanged: Math.round((advances + declines) * 0.05),
        ratio: Math.round(adRatio * 100) / 100,
        netAdvances: advances - declines,
      },
      newHighsLows: {
        newHighs,
        newLows,
        ratio: Math.round(hlRatio * 100) / 100,
        netHighs: newHighs - newLows,
      },
      level,
      interpretation,
    };
  } catch (e) {
    console.error("Failed to fetch breadth data:", e);
    return {
      advanceDecline: {
        advances: null,
        declines: null,
        unchanged: null,
        ratio: null,
        netAdvances: null,
      },
      newHighsLows: {
        newHighs: null,
        newLows: null,
        ratio: null,
        netHighs: null,
      },
      level: "neutral",
      interpretation: "Data unavailable",
    };
  }
}

// Fetch McClellan Oscillator approximation
async function fetchMcClellanData() {
  try {
    // McClellan Oscillator uses 19-day and 39-day EMAs of A/D difference
    // Without historical A/D data, we approximate from market ETFs
    
    const [spyHistory] = await Promise.all([
      yahooFinance.historical("SPY", {
        period1: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days
        period2: new Date(),
        interval: "1d",
      }),
    ]);
    
    if (!spyHistory || spyHistory.length < 39) {
      return { oscillator: null, signal: null };
    }
    
    // Simple approximation: use price momentum as proxy
    const returns = spyHistory.slice(-40).map((d, i, arr) => 
      i > 0 ? ((d.close || 0) - (arr[i-1]?.close || 0)) / (arr[i-1]?.close || 1) : 0
    ).slice(1);
    
    // 19-period EMA of returns
    const ema19 = calculateEMA(returns, 19);
    const ema39 = calculateEMA(returns, 39);
    
    const oscillator = (ema19 - ema39) * 1000; // Scale to typical McClellan range
    
    return {
      oscillator: Math.round(oscillator * 10) / 10,
      signal: oscillator > 0 ? "bullish" : oscillator < 0 ? "bearish" : "neutral",
    };
  } catch (e) {
    console.error("McClellan calculation error:", e);
    return { oscillator: null, signal: null };
  }
}

function calculateEMA(data: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  
  return ema;
}

export async function GET() {
  try {
    const [breadth, mcclellan] = await Promise.all([
      fetchBreadthFromIndex(),
      fetchMcClellanData(),
    ]);
    
    return NextResponse.json({
      ...breadth,
      mcclellan,
      source: "Estimated from market ETFs",
      note: "NYSE advance/decline and new highs/lows approximated from broad market ETF performance",
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Breadth API error:", e);
    return NextResponse.json({
      advanceDecline: { advances: null, declines: null, unchanged: null, ratio: null, netAdvances: null },
      newHighsLows: { newHighs: null, newLows: null, ratio: null, netHighs: null },
      level: "neutral",
      interpretation: "Data unavailable",
      mcclellan: { oscillator: null, signal: null },
      error: String(e),
      updatedAt: new Date().toISOString(),
    });
  }
}
