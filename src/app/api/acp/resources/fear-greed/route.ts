import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Public ACP V2 Resource — Crypto Fear & Greed Index feed.
// Wraps alternative.me's public FGI with cycle-phase classification +
// 1Y percentile context so polling agents get an actionable response,
// not just a raw 0-100 number.

interface FgiResponse {
  value: number;                         // 0–100
  classification: string;                // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
  cyclePhase: "capitulation" | "accumulation" | "neutral" | "distribution" | "euphoria";
  signal: "STRONG_BUY" | "BUY" | "HOLD" | "REDUCE" | "STRONG_REDUCE";
  percentile1y: number | null;           // 0–100, where this value sits vs trailing 365d
  change24h: number | null;
  change7d: number | null;
  timestamp: string;
}

function classifyCycle(value: number): { cyclePhase: FgiResponse["cyclePhase"]; signal: FgiResponse["signal"] } {
  if (value < 20) return { cyclePhase: "capitulation", signal: "STRONG_BUY" };
  if (value < 35) return { cyclePhase: "accumulation", signal: "BUY" };
  if (value <= 55) return { cyclePhase: "neutral", signal: "HOLD" };
  if (value <= 70) return { cyclePhase: "distribution", signal: "REDUCE" };
  return { cyclePhase: "euphoria", signal: "STRONG_REDUCE" };
}

interface AlternativeMeFgi {
  value: string;
  value_classification: string;
  timestamp: string;
}

export async function GET() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=365", {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`alternative.me FGI returned ${res.status}`);
    }
    const json = (await res.json()) as { data?: AlternativeMeFgi[] };
    const series = json.data ?? [];
    if (series.length === 0) {
      return NextResponse.json({ error: "No FGI data available" }, { status: 503 });
    }

    const today = series[0];
    const value = parseInt(today.value, 10);
    const yesterday = series.length > 1 ? parseInt(series[1].value, 10) : null;
    const weekAgo = series.length > 7 ? parseInt(series[7].value, 10) : null;

    const lookback = series.slice(0, 365).map((d) => parseInt(d.value, 10)).filter((v) => !isNaN(v));
    const sorted = [...lookback].sort((a, b) => a - b);
    const rank = sorted.findIndex((v) => v >= value);
    const percentile1y = rank >= 0 && sorted.length > 0
      ? Math.round((rank / sorted.length) * 100)
      : null;

    const { cyclePhase, signal } = classifyCycle(value);

    const body: FgiResponse = {
      value,
      classification: today.value_classification,
      cyclePhase,
      signal,
      percentile1y,
      change24h: yesterday !== null ? value - yesterday : null,
      change7d: weekAgo !== null ? value - weekAgo : null,
      timestamp: new Date(parseInt(today.timestamp, 10) * 1000).toISOString(),
    };

    return NextResponse.json(body, {
      headers: { "cache-control": "public, max-age=300, s-maxage=300" },
    });
  } catch (err) {
    logger.error("resources/fear-greed", `Failed to fetch FGI: ${err}`);
    return NextResponse.json(
      { error: "Fear & Greed index temporarily unavailable" },
      { status: 503 }
    );
  }
}
