import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";

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

/**
 * Fetch real NYSE advance/decline and new highs/lows from WSJ Markets Diary.
 * This returns actual counts — not estimates.
 */
async function fetchBreadthFromWSJ(): Promise<BreadthData> {
  const url =
    "https://www.wsj.com/market-data/stocks?id=%7B%22application%22%3A%22WSJ%22%2C%22marketsDiaryType%22%3A%22overview%22%7D&type=mdc_marketsdiary";

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; claudius-hq/1.0)",
      Accept: "application/json",
    },
  });

  if (!resp.ok) throw new Error(`WSJ breadth fetch failed: ${resp.status}`);

  const json = await resp.json();
  const instrumentSets = json.data.instrumentSets;

  // instrumentSets[0] = Issues (Advancing, Declining, Unchanged, Total)
  // instrumentSets[1] = Issues At (New Highs, New Lows)
  const issues = instrumentSets[0].instruments;
  const issuesAt = instrumentSets[1].instruments;

  const parseNum = (s: string) => parseInt(s.replace(/,/g, ""), 10);

  const advances = parseNum(issues.find((i: { name: string }) => i.name === "Advancing").NYSE);
  const declines = parseNum(issues.find((i: { name: string }) => i.name === "Declining").NYSE);
  const unchanged = parseNum(issues.find((i: { name: string }) => i.name === "Unchanged").NYSE);

  const newHighs = parseNum(issuesAt.find((i: { name: string }) => i.name === "New Highs").NYSE);
  const newLows = parseNum(issuesAt.find((i: { name: string }) => i.name === "New Lows").NYSE);

  // Compute derived values
  const ratio = declines > 0 ? Math.round((advances / declines) * 100) / 100 : 2;
  const hlRatio = newLows > 0 ? Math.round((newHighs / newLows) * 100) / 100 : 2;

  let level: "bullish" | "neutral" | "bearish";
  let interpretation: string;

  if (ratio > 2) {
    level = "bullish";
    interpretation = "Strong breadth — broad buying";
  } else if (ratio > 1.2) {
    level = "bullish";
    interpretation = "Healthy breadth — more advancers than decliners";
  } else if (ratio < 0.5) {
    level = "bearish";
    interpretation = "Weak breadth — broad selling pressure";
  } else if (ratio < 0.8) {
    level = "bearish";
    interpretation = "Deteriorating breadth — declining stocks dominate";
  } else {
    level = "neutral";
    interpretation = "Mixed breadth — roughly equal advancers and decliners";
  }

  return {
    advanceDecline: {
      advances,
      declines,
      unchanged,
      ratio,
      netAdvances: advances - declines,
    },
    newHighsLows: {
      newHighs,
      newLows,
      ratio: hlRatio,
      netHighs: newHighs - newLows,
    },
    level,
    interpretation,
  };
}

/**
 * Fallback: estimate breadth from ETF price changes when WSJ is unavailable.
 * This is less accurate but better than showing nothing.
 */
async function fetchBreadthFallback(): Promise<BreadthData> {
  try {
    const [spyQuote, qqqQuote, iwmQuote] = await Promise.all([
      yahooFinance.quote("SPY"),
      yahooFinance.quote("QQQ"),
      yahooFinance.quote("IWM"),
    ]);

    const spyChange =
      (spyQuote as { regularMarketChangePercent?: number })?.regularMarketChangePercent || 0;
    const qqqChange =
      (qqqQuote as { regularMarketChangePercent?: number })?.regularMarketChangePercent || 0;
    const iwmChange =
      (iwmQuote as { regularMarketChangePercent?: number })?.regularMarketChangePercent || 0;

    const avgChange = (spyChange + qqqChange + iwmChange) / 3;

    let advances: number;
    let declines: number;
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

    let newHighs: number;
    let newLows: number;
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

    let level: "bullish" | "neutral" | "bearish";
    let interpretation: string;

    if (adRatio > 1.5 && hlRatio > 1.5) {
      level = "bullish";
      interpretation = "Strong breadth - broad market participation in rally";
    } else if (adRatio < 0.7 || hlRatio < 0.5) {
      level = "bearish";
      interpretation = "Weak breadth - selling pressure widespread";
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
    logger.error("breadth", "Fallback breadth fetch also failed", { error: e });
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

async function fetchMcClellanData() {
  try {
    const [spyChartResult] = await Promise.all([
      yahooFinance.chart("SPY", {
        period1: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        period2: new Date(),
        interval: "1d",
      }),
    ]);
    const spyHistory = spyChartResult.quotes;

    if (!spyHistory || spyHistory.length < 39) {
      return { oscillator: null, signal: null };
    }

    const returns = spyHistory
      .slice(-40)
      .map((d, i, arr) =>
        i > 0
          ? ((d.close || 0) - (arr[i - 1]?.close || 0)) / (arr[i - 1]?.close || 1)
          : 0,
      )
      .slice(1);

    const ema19 = calculateEMA(returns, 19);
    const ema39 = calculateEMA(returns, 39);

    const oscillator = (ema19 - ema39) * 1000;

    return {
      oscillator: Math.round(oscillator * 10) / 10,
      signal: oscillator > 0 ? "bullish" : oscillator < 0 ? "bearish" : "neutral",
    };
  } catch (e) {
    logger.error("breadth", "McClellan calculation error", { error: e });
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

export async function fetchBreadthData() {
  // Try WSJ first (real data), fall back to ETF estimation
  let breadth: BreadthData;
  let source: string;
  let note: string;

  try {
    breadth = await fetchBreadthFromWSJ();
    source = "WSJ Markets Diary";
    note = "NYSE advance/decline and new highs/lows from Wall Street Journal";
  } catch (e) {
    logger.warn("breadth", "WSJ fetch failed, using ETF fallback", { error: e });
    breadth = await fetchBreadthFallback();
    source = "Estimated from market ETFs";
    note = "NYSE advance/decline and new highs/lows approximated from broad market ETF performance";
  }

  const mcclellan = await fetchMcClellanData();

  return {
    ...breadth,
    mcclellan,
    source,
    note,
    updatedAt: new Date().toISOString(),
  };
}
