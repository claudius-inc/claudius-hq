import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function getVixLevel(vix: number): "low" | "moderate" | "elevated" | "fear" {
  if (vix < 15) return "low";
  if (vix <= 20) return "moderate";
  if (vix <= 30) return "elevated";
  return "fear";
}

// Put/Call ratio removed — no reliable free data source exists.
// CBOE HTML scraper returned false positives (matched boilerplate text).
// UVXY/SPY volume proxy was uncalibrated. VIX + A/D cover the signal space.

async function fetchVolatilityContext() {
  try {
    const [vixQuote, vix3mQuote] = await Promise.all([
      yahooFinance.quote("^VIX"),
      yahooFinance.quote("^VIX3M"),
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

export async function fetchSentimentData() {
  const vixQuote = await yahooFinance.quote("^VIX") as {
    regularMarketPrice?: number;
    regularMarketChange?: number;
    regularMarketChangePercent?: number;
  };

  const vixValue = vixQuote?.regularMarketPrice ?? null;
  const vixChange = vixQuote?.regularMarketChange ?? null;
  const vixChangePct = vixQuote?.regularMarketChangePercent ?? null;

  const volContext = await fetchVolatilityContext();

  return {
    vix: {
      value: vixValue !== null ? Math.round(vixValue * 100) / 100 : null,
      change: vixChange !== null ? Math.round(vixChange * 100) / 100 : null,
      changePercent: vixChangePct !== null ? Math.round(vixChangePct * 100) / 100 : null,
      level: vixValue !== null ? getVixLevel(vixValue) : null,
    },

    volatilityContext: volContext,
    updatedAt: new Date().toISOString(),
  };
}
