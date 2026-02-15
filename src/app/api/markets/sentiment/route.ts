import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// Instantiate Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Revalidate every 15 minutes
export const revalidate = 900;

// VIX level thresholds
function getVixLevel(vix: number): "low" | "moderate" | "elevated" | "fear" {
  if (vix < 15) return "low";
  if (vix <= 25) return "moderate";
  if (vix <= 35) return "elevated";
  return "fear";
}

// Put/Call ratio thresholds
function getPutCallLevel(ratio: number): "greedy" | "neutral" | "fearful" {
  if (ratio < 0.7) return "greedy";
  if (ratio <= 1.0) return "neutral";
  return "fearful";
}

// Estimate Put/Call ratio from SQQQ/TQQQ volume ratio (options proxy)
// When traders are bearish, they buy more SQQQ (inverse), raising the ratio
async function estimatePutCallRatio(): Promise<{ value: number; level: "greedy" | "neutral" | "fearful" } | null> {
  try {
    // Use VXX (VIX futures ETF) vs SPY volume as a fear proxy
    // High VXX relative volume = more put-like sentiment
    const [spyQuote, vxxQuote] = await Promise.all([
      yahooFinance.quote("SPY"),
      yahooFinance.quote("VIXY"), // VIX Short-term futures ETF
    ]);

    const spyVol = (spyQuote as { regularMarketVolume?: number })?.regularMarketVolume;
    const spyAvgVol = (spyQuote as { averageDailyVolume10Day?: number })?.averageDailyVolume10Day;
    const vxxVol = (vxxQuote as { regularMarketVolume?: number })?.regularMarketVolume;
    const vxxAvgVol = (vxxQuote as { averageDailyVolume10Day?: number })?.averageDailyVolume10Day;

    if (!spyVol || !spyAvgVol || !vxxVol || !vxxAvgVol) {
      return null;
    }

    // Calculate relative volume vs average
    const spyRelVol = spyVol / spyAvgVol;
    const vxxRelVol = vxxVol / vxxAvgVol;

    // Ratio of VXX relative volume to SPY relative volume
    // Higher = more fear/protection buying
    // Normalize to put/call-like scale (0.5 - 1.5 range)
    const rawRatio = vxxRelVol / spyRelVol;
    const normalizedRatio = 0.5 + (rawRatio * 0.5); // Scale to reasonable range

    // Clamp to realistic bounds
    const ratio = Math.max(0.4, Math.min(1.8, normalizedRatio));

    return {
      value: Math.round(ratio * 100) / 100,
      level: getPutCallLevel(ratio),
    };
  } catch (e) {
    console.error("Failed to estimate put/call ratio:", e);
    return null;
  }
}

// GET /api/markets/sentiment
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

    // Estimate put/call ratio
    const putCallData = await estimatePutCallRatio();

    // Build response
    const response: {
      vix: {
        value: number | null;
        change: number | null;
        level: "low" | "moderate" | "elevated" | "fear" | null;
      };
      putCall: {
        value: number | null;
        level: "greedy" | "neutral" | "fearful" | null;
        note: string;
      };
      updatedAt: string;
    } = {
      vix: {
        value: vixValue !== null ? Math.round(vixValue * 100) / 100 : null,
        change: vixChange !== null ? Math.round(vixChange * 100) / 100 : null,
        level: vixValue !== null ? getVixLevel(vixValue) : null,
      },
      putCall: {
        value: putCallData?.value ?? null,
        level: putCallData?.level ?? null,
        note: "Estimated from volatility ETF relative volume",
      },
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("Failed to get sentiment data:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
