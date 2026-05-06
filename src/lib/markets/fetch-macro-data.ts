import { MACRO_INDICATORS, interpretValue, calculatePercentile } from "@/lib/markets/macro-indicators";
import { logger } from "@/lib/logger";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

// Fetch DXY from Yahoo Finance (ICE US Dollar Index)
async function fetchDxyFromYahoo(): Promise<{ current: number; history: number[] } | null> {
  try {
    const chartResult = await yahooFinance.chart("DX-Y.NYB", {
      period1: new Date(Date.now() - 365 * 5 * 24 * 60 * 60 * 1000), // 5 years
      period2: new Date(),
      interval: "1d",
    });
    const history = chartResult.quotes;
    
    if (!history || history.length === 0) return null;
    
    // Get closing prices, most recent first
    const prices = history
      .map(d => d.close)
      .filter((p): p is number => p !== null && p !== undefined)
      .reverse();
    
    if (prices.length === 0) return null;
    
    return {
      current: prices[0],
      history: prices.slice(0, 260), // ~1 year of trading days
    };
  } catch (error) {
    logger.error("fetch-macro-data", "Error fetching DXY from Yahoo", { error });
    return null;
  }
}

async function fetchFredSeries(seriesId: string, limit = 260): Promise<{ current: number; history: number[] } | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    logger.warn("fetch-macro-data", "FRED_API_KEY not set");
    return null;
  }

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
    const res = await fetch(url, { cache: "no-store" });
    
    if (!res.ok) {
      logger.error("fetch-macro-data", `FRED API error for ${seriesId}: ${res.status}`);
      return null;
    }

    const data: FredResponse = await res.json();
    const observations = data.observations
      .filter(o => o.value !== ".")
      .map(o => parseFloat(o.value));

    if (observations.length === 0) return null;

    return {
      current: observations[0],
      history: observations,
    };
  } catch (error) {
    logger.error("fetch-macro-data", `Error fetching ${seriesId}`, { error });
    return null;
  }
}

async function fetchYieldCurve(): Promise<{ current: number; history: number[] } | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;
  return fetchFredSeries("T10Y2Y");
}

export interface MacroIndicatorResult {
  id: string;
  name: string;
  category: string;
  unit: string;
  data: {
    current: number;
    min: number;
    max: number;
    avg: number;
  } | null;
  interpretation: { label: string; meaning: string } | null;
  percentile: number | null;
}

export interface MacroDataResult {
  status: "live" | "demo";
  message?: string;
  lastUpdated: string;
  indicators: MacroIndicatorResult[];
}

export async function fetchMacroData(): Promise<MacroDataResult> {
  const apiKey = process.env.FRED_API_KEY;
  
  if (!apiKey) {
    return {
      status: "demo",
      message: "FRED_API_KEY not configured. Showing demo data.",
      lastUpdated: new Date().toISOString(),
      indicators: MACRO_INDICATORS.map(indicator => ({
        ...indicator,
        data: null,
        interpretation: null,
        percentile: null,
      })),
    };
  }

  const results = await Promise.all(
    MACRO_INDICATORS.map(async (indicator) => {
      let data;

      if (indicator.id === "yield-curve") {
        data = await fetchYieldCurve();
        if (data) {
          data.current = data.current * 100;
          data.history = data.history.map(v => v * 100);
        }
      } else if (indicator.id === "dxy") {
        // Use Yahoo Finance for actual ICE DXY instead of FRED Trade-Weighted Index
        data = await fetchDxyFromYahoo();
      } else {
        data = await fetchFredSeries(indicator.fredCode);
      }

      // Credit spreads: FRED reports in %, ranges expect bps
      if (data && indicator.id === "hy-spread") {
        data.current = data.current * 100;
        data.history = data.history.map(v => v * 100);
      }

      // Initial claims: FRED reports raw numbers, ranges expect thousands
      if (data && indicator.id === "initial-claims") {
        data.current = data.current / 1000;
        data.history = data.history.map(v => v / 1000);
      }

      // For CPI/PCE/Industrial Production, calculate YoY change
      if (data && (indicator.id === "cpi" || indicator.id === "core-pce" || indicator.id === "industrial-production")) {
        if (data.history.length >= 13) {
          const current = data.history[0];
          const yearAgo = data.history[12];
          data.current = ((current - yearAgo) / yearAgo) * 100;
          
          const yoyHistory: number[] = [];
          for (let i = 0; i < data.history.length - 12; i++) {
            const val = ((data.history[i] - data.history[i + 12]) / data.history[i + 12]) * 100;
            yoyHistory.push(val);
          }
          data.history = yoyHistory;
        }
      }

      const interpretation = data ? interpretValue(indicator, data.current) : null;
      const percentile = data ? calculatePercentile(data.current, data.history) : null;

      return {
        ...indicator,
        data: data ? {
          current: Math.round(data.current * 100) / 100,
          min: Math.min(...data.history),
          max: Math.max(...data.history),
          avg: Math.round((data.history.reduce((a, b) => a + b, 0) / data.history.length) * 100) / 100,
        } : null,
        interpretation,
        percentile,
      };
    })
  );

  return {
    status: "live",
    lastUpdated: new Date().toISOString(),
    indicators: results,
  };
}
