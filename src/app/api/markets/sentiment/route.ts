import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// Revalidate every 1 hour (CBOE updates daily)
export const revalidate = 3600;

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// VIX level thresholds
function getVixLevel(vix: number): "low" | "moderate" | "elevated" | "fear" {
  if (vix < 15) return "low";
  if (vix <= 20) return "moderate";
  if (vix <= 30) return "elevated";
  return "fear";
}

// Put/Call ratio thresholds (for equity P/C)
function getPutCallLevel(ratio: number): "greedy" | "neutral" | "fearful" {
  // CBOE equity put/call ratio historical ranges:
  // < 0.6 = extreme greed (contrarian bearish)
  // 0.6-0.8 = normal/neutral
  // > 0.8 = fear (contrarian bullish)
  if (ratio < 0.6) return "greedy";
  if (ratio <= 0.85) return "neutral";
  return "fearful";
}

// Fetch actual CBOE Put/Call ratio from their website
async function fetchCboePutCall(): Promise<{ value: number; source: string } | null> {
  try {
    // CBOE publishes daily put/call ratios
    // We'll scrape from their market statistics page
    const res = await fetch("https://www.cboe.com/us/options/market_statistics/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ClaudiusHQ/1.0)",
        "Accept": "text/html",
      },
      next: { revalidate: 3600 },
    });
    
    if (!res.ok) {
      console.error("CBOE page fetch error:", res.status);
      return null;
    }
    
    const html = await res.text();
    
    // Look for equity put/call ratio in the page
    // CBOE format varies but typically includes "Equity Put/Call Ratio" or similar
    const patterns = [
      /equity\s*put\s*\/?\s*call\s*ratio[:\s]*(\d+\.?\d*)/i,
      /put\s*\/?\s*call\s*ratio[:\s]*equity[:\s]*(\d+\.?\d*)/i,
      /EQUITY[^<]*?(\d+\.\d+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const value = parseFloat(match[1]);
        if (value > 0 && value < 3) { // Sanity check
          return { value, source: "CBOE" };
        }
      }
    }
    
    return null;
  } catch (e) {
    console.error("Failed to fetch CBOE P/C:", e);
    return null;
  }
}

// Fallback: Estimate from VIX ETF relative volume
async function estimatePutCallFromVolatilityETFs(): Promise<{ value: number; source: string } | null> {
  try {
    const [spyQuote, uvxyQuote] = await Promise.all([
      yahooFinance.quote("SPY"),
      yahooFinance.quote("UVXY"), // 1.5x VIX futures ETF
    ]);

    const spyVol = (spyQuote as { regularMarketVolume?: number })?.regularMarketVolume;
    const spyAvgVol = (spyQuote as { averageDailyVolume10Day?: number })?.averageDailyVolume10Day;
    const uvxyVol = (uvxyQuote as { regularMarketVolume?: number })?.regularMarketVolume;
    const uvxyAvgVol = (uvxyQuote as { averageDailyVolume10Day?: number })?.averageDailyVolume10Day;

    if (!spyVol || !spyAvgVol || !uvxyVol || !uvxyAvgVol) {
      return null;
    }

    // Calculate relative volume vs average
    const spyRelVol = spyVol / spyAvgVol;
    const uvxyRelVol = uvxyVol / uvxyAvgVol;

    // Ratio of UVXY relative volume to SPY relative volume
    // Higher = more protection buying (put-like behavior)
    const rawRatio = uvxyRelVol / spyRelVol;
    
    // Normalize to P/C-like scale (typical range 0.5-1.2)
    const ratio = 0.5 + (rawRatio * 0.35);
    
    // Clamp to realistic bounds
    return {
      value: Math.max(0.4, Math.min(1.5, ratio)),
      source: "UVXY/SPY volume proxy",
    };
  } catch (e) {
    console.error("Failed to estimate P/C from ETFs:", e);
    return null;
  }
}

// Fetch VXX/UVXY term structure for additional context
async function fetchVolatilityContext() {
  try {
    const [vixQuote, vix3mQuote] = await Promise.all([
      yahooFinance.quote("^VIX"),
      yahooFinance.quote("^VIX3M"), // 3-month VIX
    ]);
    
    const vix = (vixQuote as { regularMarketPrice?: number })?.regularMarketPrice;
    const vix3m = (vix3mQuote as { regularMarketPrice?: number })?.regularMarketPrice;
    
    if (vix && vix3m) {
      const termStructure = vix / vix3m;
      return {
        termStructure: Math.round(termStructure * 100) / 100,
        contango: termStructure < 1 ? "contango" : "backwardation",
        interpretation: termStructure > 1.1 
          ? "Inverted VIX curve - near-term fear elevated" 
          : termStructure < 0.9 
            ? "Steep contango - complacency" 
            : "Normal term structure",
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // Fetch VIX
    const vixQuote = await yahooFinance.quote("^VIX") as {
      regularMarketPrice?: number;
      regularMarketChange?: number;
      regularMarketChangePercent?: number;
    };

    const vixValue = vixQuote?.regularMarketPrice ?? null;
    const vixChange = vixQuote?.regularMarketChange ?? null;
    const vixChangePct = vixQuote?.regularMarketChangePercent ?? null;

    // Try CBOE first, fall back to ETF estimate
    let putCallData = await fetchCboePutCall();
    
    if (!putCallData) {
      putCallData = await estimatePutCallFromVolatilityETFs();
    }
    
    // Get volatility term structure
    const volContext = await fetchVolatilityContext();

    const response = {
      vix: {
        value: vixValue !== null ? Math.round(vixValue * 100) / 100 : null,
        change: vixChange !== null ? Math.round(vixChange * 100) / 100 : null,
        changePercent: vixChangePct !== null ? Math.round(vixChangePct * 100) / 100 : null,
        level: vixValue !== null ? getVixLevel(vixValue) : null,
      },
      putCall: {
        value: putCallData ? Math.round(putCallData.value * 100) / 100 : null,
        level: putCallData ? getPutCallLevel(putCallData.value) : null,
        source: putCallData?.source || "unavailable",
      },
      volatilityContext: volContext,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("Failed to get sentiment data:", e);
    return NextResponse.json({
      vix: { value: null, change: null, changePercent: null, level: null },
      putCall: { value: null, level: null, source: "error" },
      volatilityContext: null,
      error: String(e),
      updatedAt: new Date().toISOString(),
    }, { status: 500 });
  }
}
