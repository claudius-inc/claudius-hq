import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/market-cache";
import { logger } from "@/lib/logger";
import { computeGavekalQuadrant } from "@/lib/gavekal";
import { fetchValuationData } from "@/lib/valuation";
import { fetchSentimentData } from "@/lib/sentiment";
import { fetchBreadthData } from "@/lib/breadth";
import { fetchThemePerformanceAll } from "@/lib/themes";

export const dynamic = "force-dynamic";

const CACHE_KEY = "allocation-signal";
const CACHE_MAX_AGE = 60; // 60 seconds

interface AllocationSignalResponse {
  regime: {
    name: string;
    implication: string;
    color: string;
  };
  valuation: {
    zone: string;
    score: number;
    color: string;
  };
  sentiment: {
    composite: number;
    label: string;
    color: string;
  };
  themes: {
    top3: Array<{
      name: string;
      perf1m: number;
      crowding: number | null;
    }>;
  };
  bias: string;
  updatedAt: string;
}

// Compute composite sentiment from VIX + Put/Call + Breadth (0-100 scale, 0=extreme fear, 100=extreme greed)
function computeSentimentComposite(
  vix: { value: number | null; level: string | null } | null,
  putCall: { value: number | null; level: string | null } | null,
  breadth: { level: string | null } | null,
): { composite: number; label: string; color: string } {
  const scores: number[] = [];

  // VIX: inverted (high VIX = fear = low score)
  if (vix?.value != null) {
    if (vix.value < 12) scores.push(90);
    else if (vix.value < 15) scores.push(75);
    else if (vix.value < 20) scores.push(55);
    else if (vix.value < 25) scores.push(35);
    else if (vix.value < 30) scores.push(20);
    else scores.push(10);
  }

  // Put/Call: inverted (high P/C = fear = low score)
  if (putCall?.value != null) {
    if (putCall.value < 0.5) scores.push(90);
    else if (putCall.value < 0.65) scores.push(75);
    else if (putCall.value < 0.85) scores.push(50);
    else if (putCall.value < 1.0) scores.push(30);
    else scores.push(15);
  }

  // Breadth: direct mapping
  if (breadth?.level) {
    if (breadth.level === "bullish") scores.push(75);
    else if (breadth.level === "neutral") scores.push(50);
    else scores.push(25);
  }

  const composite = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 50;

  let label: string;
  let color: string;
  if (composite >= 75) { label = "Extreme Greed"; color = "red"; }
  else if (composite >= 60) { label = "Greed"; color = "orange"; }
  else if (composite >= 40) { label = "Neutral"; color = "gray"; }
  else if (composite >= 25) { label = "Fear"; color = "emerald"; }
  else { label = "Extreme Fear"; color = "emerald"; }

  return { composite, label, color };
}

function getValuationSummary(
  valuations: Array<{ market: string; zone: string; percentOfMean: number }> | null,
): { zone: string; score: number; color: string } {
  if (!valuations || valuations.length === 0) {
    return { zone: "Unknown", score: 100, color: "gray" };
  }

  // Weighted average: US counts more
  const weights: Record<string, number> = { US: 3, JAPAN: 1, SINGAPORE: 1, CHINA: 1, HONG_KONG: 1 };
  let totalWeight = 0;
  let weightedPct = 0;
  for (const v of valuations) {
    const w = weights[v.market] ?? 1;
    totalWeight += w;
    weightedPct += v.percentOfMean * w;
  }
  const avgPct = Math.round(weightedPct / totalWeight);

  let zone: string;
  let color: string;
  if (avgPct < 80) { zone = "Undervalued"; color = "emerald"; }
  else if (avgPct < 110) { zone = "Fair"; color = "gray"; }
  else if (avgPct < 140) { zone = "Stretched"; color = "orange"; }
  else { zone = "Expensive"; color = "red"; }

  return { zone, score: avgPct, color };
}

function buildBiasLine(
  regime: { name: string } | null,
  valuation: { zone: string } | null,
  themes: Array<{ name: string; perf1m: number; crowding: number | null }>,
): string {
  const parts: string[] = [];

  if (regime?.name) {
    parts.push(`Regime: ${regime.name}`);
  }
  if (valuation?.zone) {
    parts.push(`Valuations ${valuation.zone.toLowerCase()}`);
  }
  if (themes.length > 0) {
    const top = themes[0];
    const perfStr = top.perf1m >= 0 ? `+${top.perf1m.toFixed(1)}%` : `${top.perf1m.toFixed(1)}%`;
    const crowdStr = top.crowding != null
      ? top.crowding < 40 ? "low crowd" : top.crowding < 65 ? "moderate crowd" : "high crowd"
      : "";
    parts.push(`Top theme: ${top.name} (${perfStr} 1M${crowdStr ? `, ${crowdStr}` : ""})`);
  }

  return parts.join(". ") + ".";
}

// Map Gavekal quadrant name to simple color key
function quadrantToColor(name: string): string {
  const map: Record<string, string> = {
    "Deflationary Boom": "emerald",
    "Inflationary Boom": "orange",
    "Deflationary Bust": "blue",
    "Inflationary Bust": "red",
  };
  return map[name] || "gray";
}

async function fetchAllocationSignal(): Promise<AllocationSignalResponse> {
  // All data fetched via direct imports — no HTTP self-fetches
  const [gavekalData, valuationRes, sentimentRes, breadthRes, themesPerfRes] = await Promise.all([
    computeGavekalQuadrant().catch(() => null),
    fetchValuationData().catch(() => null),
    fetchSentimentData().catch(() => null),
    fetchBreadthData().catch(() => null),
    fetchThemePerformanceAll().catch((e) => {
      logger.error("allocation-signal", "Failed to fetch theme performance", { error: e });
      return null;
    }),
  ]);

  // Regime from Gavekal
  const regime = gavekalData?.quadrant
    ? {
        name: gavekalData.quadrant.name as string,
        implication: gavekalData.quadrant.description as string,
        color: quadrantToColor(gavekalData.quadrant.name),
      }
    : { name: "Unknown", implication: "Insufficient data", color: "gray" };

  // Valuation summary
  const valuation = getValuationSummary(valuationRes?.valuations ?? null);

  // Sentiment composite
  const sentimentComp = computeSentimentComposite(
    sentimentRes?.vix ?? null,
    sentimentRes?.putCall ?? null,
    breadthRes ?? null,
  );

  // Theme top 3 by 1M performance — uses pre-aggregated rows from fetchThemePerformanceAll
  let top3Themes: Array<{ name: string; perf1m: number; crowding: number | null }> = [];
  if (themesPerfRes?.themes) {
    top3Themes = themesPerfRes.themes
      .filter((t) => t.performance_1m != null)
      .sort((a, b) => (b.performance_1m ?? 0) - (a.performance_1m ?? 0))
      .slice(0, 3)
      .map((t) => ({
        name: t.name,
        perf1m: Math.round((t.performance_1m ?? 0) * 100) / 100,
        crowding: t.crowdingScore,
      }));
  }

  const bias = buildBiasLine(regime, valuation, top3Themes);

  return {
    regime,
    valuation,
    sentiment: sentimentComp,
    themes: { top3: top3Themes },
    bias,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<AllocationSignalResponse>(CACHE_KEY, CACHE_MAX_AGE);
      if (cached && !cached.isStale) {
        return NextResponse.json({ ...cached.data, cached: true });
      }
      if (cached) {
        // Return stale data, refresh in background
        fetchAllocationSignal()
          .then((data) => setCache(CACHE_KEY, data))
          .catch((e) => logger.error("allocation-signal", "Background refresh failed", { error: e }));
        return NextResponse.json({ ...cached.data, cached: true, isStale: true });
      }
    }

    const data = await fetchAllocationSignal();
    await setCache(CACHE_KEY, data);

    return NextResponse.json({ ...data, cached: false });
  } catch (error) {
    logger.error("allocation-signal", "Failed to compute allocation signal", { error });
    return NextResponse.json(
      { error: "Failed to compute allocation signal" },
      { status: 500 },
    );
  }
}
