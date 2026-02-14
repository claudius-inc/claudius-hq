import { NextResponse } from "next/server";
import { MACRO_INDICATORS, interpretValue, calculatePercentile } from "@/lib/macro-indicators";

// Cache for 1 hour (most data is daily at best)
export const revalidate = 3600;

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

async function fetchFredSeries(seriesId: string, limit = 260): Promise<{ current: number; history: number[] } | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn("FRED_API_KEY not set");
    return null;
  }

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    
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

// Calculate yield curve from 10Y and 2Y
async function fetchYieldCurve(): Promise<{ current: number; history: number[] } | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  // FRED has T10Y2Y directly
  return fetchFredSeries("T10Y2Y");
}

export async function GET() {
  const apiKey = process.env.FRED_API_KEY;
  
  if (!apiKey) {
    // Return mock data for development/demo
    return NextResponse.json({
      status: "demo",
      message: "FRED_API_KEY not configured. Showing demo data.",
      lastUpdated: new Date().toISOString(),
      indicators: MACRO_INDICATORS.map(indicator => ({
        ...indicator,
        data: null,
        interpretation: null,
        percentile: null,
      })),
    });
  }

  // Fetch all indicators
  const results = await Promise.all(
    MACRO_INDICATORS.map(async (indicator) => {
      let data;
      
      if (indicator.id === "yield-curve") {
        data = await fetchYieldCurve();
        // Convert to basis points for display
        if (data) {
          data.current = data.current * 100;
          data.history = data.history.map(v => v * 100);
        }
      } else {
        data = await fetchFredSeries(indicator.fredCode);
      }

      // For CPI/PCE, calculate YoY change
      if (data && (indicator.id === "cpi" || indicator.id === "core-pce")) {
        // FRED CPIAUCSL is index, need to calculate YoY %
        if (data.history.length >= 13) {
          const current = data.history[0];
          const yearAgo = data.history[12];
          data.current = ((current - yearAgo) / yearAgo) * 100;
          
          // Calculate historical YoY for percentile
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

  return NextResponse.json({
    status: "live",
    lastUpdated: new Date().toISOString(),
    indicators: results,
  });
}
