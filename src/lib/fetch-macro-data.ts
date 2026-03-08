import { MACRO_INDICATORS, interpretValue, calculatePercentile } from "@/lib/macro-indicators";
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
    const history = await yahooFinance.historical("DX-Y.NYB", {
      period1: new Date(Date.now() - 365 * 5 * 24 * 60 * 60 * 1000), // 5 years
      period2: new Date(),
      interval: "1d",
    });
    
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
    console.error("Error fetching DXY from Yahoo:", error);
    return null;
  }
}

async function fetchFredSeries(seriesId: string, limit = 260): Promise<{ current: number; history: number[] } | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn("FRED_API_KEY not set");
    return null;
  }

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
    const res = await fetch(url, { cache: "no-store" });
    
    if (!res.ok) {
      console.error(`FRED API error for ${seriesId}: ${res.status}`);
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
    console.error(`Error fetching ${seriesId}:`, error);
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

export interface YieldSpread {
  name: string;
  value: number | null;
  interpretation: string;
  color: "green" | "amber" | "gray";
}

export interface MacroDataResult {
  status: "live" | "demo";
  message?: string;
  lastUpdated: string;
  indicators: MacroIndicatorResult[];
  yieldSpreads?: YieldSpread[];
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
      if (data && (indicator.id === "hy-spread" || indicator.id === "ig-spread")) {
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

  // Calculate yield spreads
  const us10yIndicator = results.find(r => r.id === "10y-yield");
  const japan10yIndicator = results.find(r => r.id === "japan-10y");
  const germany10yIndicator = results.find(r => r.id === "germany-10y");

  const yieldSpreads: YieldSpread[] = [];

  // US-Japan spread (carry trade signal)
  if (us10yIndicator?.data && japan10yIndicator?.data) {
    const spread = us10yIndicator.data.current - japan10yIndicator.data.current;
    let interpretation: string;
    let color: "green" | "amber" | "gray";
    
    if (spread > 3) {
      interpretation = "Attractive Carry";
      color = "green";
    } else if (spread >= 2) {
      interpretation = "Moderate Carry";
      color = "amber";
    } else {
      interpretation = "Unattractive";
      color = "amber";
    }
    
    yieldSpreads.push({
      name: "US-Japan Spread",
      value: Math.round(spread * 100) / 100,
      interpretation,
      color,
    });
  }

  // US-Germany spread
  if (us10yIndicator?.data && germany10yIndicator?.data) {
    const spread = us10yIndicator.data.current - germany10yIndicator.data.current;
    let interpretation: string;
    let color: "green" | "amber" | "gray";
    
    if (spread > 3) {
      interpretation = "Attractive Carry";
      color = "green";
    } else if (spread >= 2) {
      interpretation = "Moderate Carry";
      color = "amber";
    } else {
      interpretation = "Unattractive";
      color = "amber";
    }
    
    yieldSpreads.push({
      name: "US-Germany Spread",
      value: Math.round(spread * 100) / 100,
      interpretation,
      color,
    });
  }

  return {
    status: "live",
    lastUpdated: new Date().toISOString(),
    indicators: results,
    yieldSpreads,
  };
}
