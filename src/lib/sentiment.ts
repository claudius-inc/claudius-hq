import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function getVixLevel(vix: number): "low" | "moderate" | "elevated" | "fear" {
  if (vix < 15) return "low";
  if (vix <= 20) return "moderate";
  if (vix <= 30) return "elevated";
  return "fear";
}

function getPutCallLevel(ratio: number): "greedy" | "neutral" | "fearful" {
  if (ratio < 0.6) return "greedy";
  if (ratio <= 0.85) return "neutral";
  return "fearful";
}

async function fetchCboePutCall(): Promise<{ value: number; source: string } | null> {
  try {
    const res = await fetch("https://www.cboe.com/us/options/market_statistics/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ClaudiusHQ/1.0)",
        "Accept": "text/html",
      },
    });

    if (!res.ok) {
      logger.error("sentiment", "CBOE page fetch error", { status: res.status });
      return null;
    }

    const html = await res.text();

    const patterns = [
      /equity\s*put\s*\/?\s*call\s*ratio[:\s]*(\d+\.?\d*)/i,
      /put\s*\/?\s*call\s*ratio[:\s]*equity[:\s]*(\d+\.?\d*)/i,
      /EQUITY[^<]*?(\d+\.\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const value = parseFloat(match[1]);
        if (value > 0 && value < 3) {
          return { value, source: "CBOE" };
        }
      }
    }

    return null;
  } catch (e) {
    logger.error("sentiment", "Failed to fetch CBOE P/C", { error: e });
    return null;
  }
}

async function estimatePutCallFromVolatilityETFs(): Promise<{ value: number; source: string } | null> {
  try {
    const [spyQuote, uvxyQuote] = await Promise.all([
      yahooFinance.quote("SPY"),
      yahooFinance.quote("UVXY"),
    ]);

    const spyVol = (spyQuote as { regularMarketVolume?: number })?.regularMarketVolume;
    const spyAvgVol = (spyQuote as { averageDailyVolume10Day?: number })?.averageDailyVolume10Day;
    const uvxyVol = (uvxyQuote as { regularMarketVolume?: number })?.regularMarketVolume;
    const uvxyAvgVol = (uvxyQuote as { averageDailyVolume10Day?: number })?.averageDailyVolume10Day;

    if (!spyVol || !spyAvgVol || !uvxyVol || !uvxyAvgVol) {
      return null;
    }

    const spyRelVol = spyVol / spyAvgVol;
    const uvxyRelVol = uvxyVol / uvxyAvgVol;
    const rawRatio = uvxyRelVol / spyRelVol;
    const ratio = 0.5 + (rawRatio * 0.35);

    return {
      value: Math.max(0.4, Math.min(1.5, ratio)),
      source: "UVXY/SPY volume proxy",
    };
  } catch (e) {
    logger.error("sentiment", "Failed to estimate P/C from ETFs", { error: e });
    return null;
  }
}

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

  let putCallData = await fetchCboePutCall();
  if (!putCallData) {
    putCallData = await estimatePutCallFromVolatilityETFs();
  }

  const volContext = await fetchVolatilityContext();

  return {
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
}
