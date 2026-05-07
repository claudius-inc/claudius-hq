/**
 * JP USD/JPY flow fetcher.
 *
 * ── Why USD/JPY for Japan ───────────────────────────────────────────────
 * USD/JPY is the single dominant macro variable for Japanese equity
 * earnings. ~50% of Nikkei 225 revenue comes from exports, so a weak yen
 * mechanically inflates reported earnings via translation. Move USD/JPY
 * from 130 to 150 and Toyota's reported earnings rise ~15% with no
 * operational change. The 50d / 200d moving averages position the rate
 * within its trend.
 *
 * Position semantics:
 *   - "above_both"  spot above 50d AND 200d MAs → yen weakness, supportive
 *                   of Nikkei export earnings
 *   - "below_both"  spot below 50d AND 200d MAs → yen strengthening,
 *                   headwind to Nikkei export earnings
 *   - "between"     mixed/transitional
 *
 * ── Pattern (mirror of src/lib/markets/flows/cn.ts) ────────────────────
 *   - Module under src/lib/markets/flows/{market}.ts
 *   - Exports a single fetchJPFX() returning JPFXData | null
 *   - Cache key:  markets:flows:jp:fx
 *   - TTL:        1h  (FX moves continuously but the daily chart series
 *                 + 50d/200d MAs only meaningfully shift over many hours;
 *                 1h matches the CN fetcher and is gentle on Yahoo)
 *   - Stale:      12 × TTL accepted on hard failure
 *   - Hard fail:  return null  → modal renders "data unavailable"
 *
 * ── Symbol choice ──────────────────────────────────────────────────────
 * Probed both USDJPY=X and JPY=X (May 2026). Both return identical data
 * including fiftyDayAverage and twoHundredDayAverage. We use USDJPY=X as
 * it's the canonical Yahoo symbol for the cross.
 */

import YahooFinance from "yahoo-finance2";

import { getCache, setCache } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";

const CACHE_KEY = "markets:flows:jp:fx";
const CACHE_TTL_SECONDS = 60 * 60; // 1h
const STALE_MULTIPLIER = 12; // 12h fallback on hard error

const SYMBOL = "USDJPY=X";
const SOURCE_NAME = "Yahoo Finance";
const SPARKLINE_BARS = 60;
const CHART_LOOKBACK_DAYS = 90; // ~60 trading days plus weekend buffer

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ── Public types ──────────────────────────────────────────────────────

export interface JPFXData {
  /** Discriminator — leave room for additional JP flow metrics later. */
  metric: "usdjpy";

  /** Latest spot rate (yen per dollar). */
  rate: number;
  /** 24h % change (already a percentage, e.g. 0.07 = +0.07%). */
  changePercent: number;

  /** 50-day moving average (from Yahoo's quote response). */
  ma50: number;
  /** 200-day moving average (from Yahoo's quote response). */
  ma200: number;

  /** Spot vs the two MAs. See module header. */
  position: "above_both" | "below_both" | "between";

  /** Daily series for sparkline (last ~60 trading days, oldest first). */
  recent: Array<{ date: string; rate: number }>;

  /** Plain-English one-liner. */
  interpretation: string;

  /** Source identifier. */
  source: string;
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
  /** Free-text caveat — surface in the modal. */
  note?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function classifyPosition(
  rate: number,
  ma50: number,
  ma200: number,
): JPFXData["position"] {
  const aboveMa50 = rate > ma50;
  const aboveMa200 = rate > ma200;
  if (aboveMa50 && aboveMa200) return "above_both";
  if (!aboveMa50 && !aboveMa200) return "below_both";
  return "between";
}

function buildInterpretation(
  rate: number,
  ma50: number,
  ma200: number,
  position: JPFXData["position"],
): string {
  const r = rate.toFixed(2);
  const m50 = ma50.toFixed(1);
  const m200 = ma200.toFixed(1);
  switch (position) {
    case "above_both":
      return `USD/JPY ${r}, above both 50d (${m50}) and 200d (${m200}) MAs — yen weakness supportive of Nikkei export earnings.`;
    case "below_both":
      return `USD/JPY ${r}, below both 50d (${m50}) and 200d (${m200}) MAs — yen strengthening, a translation headwind for Nikkei exporters.`;
    case "between":
    default: {
      const aboveMa50 = rate > ma50;
      const aboveMa200 = rate > ma200;
      const detail = aboveMa50
        ? `above 50d (${m50}), below 200d (${m200})`
        : aboveMa200
          ? `below 50d (${m50}), above 200d (${m200})`
          : `near 50d (${m50}) / 200d (${m200})`;
      return `USD/JPY ${r}, mixed trend (${detail}) — earnings translation effect transitional.`;
    }
  }
}

// ── Yahoo quote/chart shapes (narrowed) ───────────────────────────────

interface QuoteShape {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
}

interface ChartQuote {
  date: Date;
  close: number | null;
}

// ── Public fetcher ────────────────────────────────────────────────────

export async function fetchJPFX(): Promise<JPFXData | null> {
  // Fast path: serve fresh-cached data
  const cached = await getCache<JPFXData>(CACHE_KEY, CACHE_TTL_SECONDS);
  if (cached && !cached.isStale) return cached.data;

  try {
    const period1 = new Date(
      Date.now() - CHART_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );

    const [quoteRes, chartRes] = await Promise.all([
      yahooFinance.quote(SYMBOL) as Promise<QuoteShape | QuoteShape[]>,
      yahooFinance.chart(SYMBOL, { interval: "1d", period1 }),
    ]);

    const q = Array.isArray(quoteRes) ? quoteRes[0] : quoteRes;

    const rate = q?.regularMarketPrice;
    const changePercent = q?.regularMarketChangePercent;
    const ma50 = q?.fiftyDayAverage;
    const ma200 = q?.twoHundredDayAverage;

    if (
      typeof rate !== "number" ||
      typeof ma50 !== "number" ||
      typeof ma200 !== "number"
    ) {
      throw new Error(
        `Yahoo quote missing required fields for ${SYMBOL} (rate=${rate}, ma50=${ma50}, ma200=${ma200})`,
      );
    }

    const quotes: ChartQuote[] = (chartRes?.quotes ?? []) as ChartQuote[];
    // Yahoo sometimes returns null closes on partial bars — drop those.
    const cleaned = quotes
      .filter(
        (b): b is ChartQuote & { close: number } =>
          typeof b.close === "number" && Number.isFinite(b.close),
      )
      .map((b) => ({
        date: b.date.toISOString().slice(0, 10),
        rate: b.close,
      }));

    // Most recent SPARKLINE_BARS, oldest first.
    const recent = cleaned.slice(-SPARKLINE_BARS);

    const position = classifyPosition(rate, ma50, ma200);
    const interpretation = buildInterpretation(rate, ma50, ma200, position);

    const data: JPFXData = {
      metric: "usdjpy",
      rate,
      changePercent: typeof changePercent === "number" ? changePercent : 0,
      ma50,
      ma200,
      position,
      recent,
      interpretation,
      source: SOURCE_NAME,
      fetchedAt: new Date().toISOString(),
      note:
        recent.length < SPARKLINE_BARS
          ? `Showing ${recent.length} daily bars — Yahoo returned a shorter history than requested.`
          : undefined,
    };

    await setCache(CACHE_KEY, data);
    return data;
  } catch (e) {
    logger.error("markets/flows/jp", "Failed to fetch USD/JPY", { error: e });
    // Stale fallback (12h)
    const stale = await getCache<JPFXData>(
      CACHE_KEY,
      CACHE_TTL_SECONDS * STALE_MULTIPLIER,
    );
    if (stale) return stale.data;
    return null;
  }
}
