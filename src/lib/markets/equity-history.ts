/**
 * Daily history for the tradfi perps' underlyings, and the long-term trend
 * reading derived from it.
 *
 * WHAT THIS IS FOR
 * ----------------
 * The convergence screen runs on 4h bars for every name so crypto and tradfi
 * stay comparable. On 4h, SMMA-200 spans about 33 days — it cannot see a
 * long-term trend, and the screen's highest scores amount to "closing near the
 * 50-bar high", which is exactly the reading that most needs a longer-horizon
 * sanity check.
 *
 * This module supplies that check from the UNDERLYING's own daily series. The
 * two series are never joined: no splice, no back-adjustment, no fake gap where
 * the perp meets the equity.
 *
 * WHY NOT THE PERP'S OWN DAILY BARS
 * ---------------------------------
 * Because there are not enough of them — 2 of 154 tradfi contracts clear a
 * 300-bar daily floor today, against 127 once the underlying's history is
 * stored. And the perp trades weekends while its underlying does not, so a
 * perp-derived daily series carries ~100 bars a year with no cash market behind
 * them. Reading the equity's own sessions sidesteps both problems.
 */
import { rawClient } from "@/db";
import { smmaSeries } from "@/lib/markets/mcd";
import { acquireYahooSlot, withYahooRetry } from "@/lib/scanner/yahoo-rate-limiter";
import { logger } from "@/lib/logger";

export interface EquityBar {
  date: string; // YYYY-MM-DD, exchange-local
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjClose: number | null;
  volume: number | null;
}

export interface EquitySeries {
  ticker: string;
  currency: string;
  bars: EquityBar[];
}

/**
 * Bars needed before the daily trend is reported.
 *
 * Same reasoning as MCD_WARMUP: SMMA-200 is seeded with a 200-bar SMA and
 * converges geometrically, so reading it at bar 201 is mostly seed.
 */
export const DAILY_TREND_WARMUP = 300;

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

interface YahooChartResponse {
  chart: {
    error: { code: string; description: string } | null;
    result?: {
      meta: {
        currency?: string;
        symbol?: string;
        instrumentType?: string;
        regularMarketPrice?: number;
        exchangeTimezoneName?: string;
      };
      timestamp?: number[];
      indicators: {
        quote: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
        adjclose?: { adjclose?: (number | null)[] }[];
      };
    }[];
  };
}

/**
 * Converts an epoch-second bar time to a YYYY-MM-DD session date in the
 * EXCHANGE's timezone.
 *
 * Not UTC. A Hong Kong or Seoul session opens while it is still the previous
 * day in UTC, so a UTC conversion shifts those dates by one and silently
 * misaligns them against every other series.
 */
function sessionDate(epochSec: number, timeZone: string): string {
  const d = new Date(epochSec * 1000);
  // en-CA renders as YYYY-MM-DD, which is the format stored.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Fetches up to 10 years of daily bars for one Yahoo ticker.
 *
 * Routed through the repo's shared Yahoo rate limiter rather than a private
 * retry loop, so this competes fairly with the scanner for the same quota.
 */
export async function fetchEquityHistory(ticker: string): Promise<EquitySeries | null> {
  const url =
    `${YAHOO_CHART}/${encodeURIComponent(ticker)}` +
    `?range=10y&interval=1d&events=${encodeURIComponent("div,split")}`;

  await acquireYahooSlot();
  const json = await withYahooRetry(`equity-history ${ticker}`, async () => {
    const res = await fetch(url, {
      // Yahoo 429s this endpoint without a browser-ish UA. No cookie or crumb
      // is required here.
      headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    return (await res.json()) as YahooChartResponse;
  });

  const result = json?.chart?.result?.[0];
  if (!result || json.chart.error) {
    logger.warn("equity-history", "Yahoo returned no result", {
      ticker,
      error: json?.chart?.error,
    });
    return null;
  }

  // A MUTUALFUND with no price is the QNTX failure mode — a naive map's false
  // positive. Treat it as a hard rejection rather than an empty series.
  if (result.meta.instrumentType === "MUTUALFUND" && result.meta.regularMarketPrice == null) {
    logger.warn("equity-history", "Ticker resolves to a priceless mutual fund; rejected", {
      ticker,
    });
    return null;
  }

  const ts = result.timestamp ?? [];
  const q = result.indicators.quote?.[0] ?? {};
  // `adjclose` is a SIBLING of `quote` and is doubly nested under its own name.
  const adj = result.indicators.adjclose?.[0]?.adjclose;
  const tz = result.meta.exchangeTimezoneName ?? "America/New_York";

  const bars: EquityBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i] ?? null;
    // Halt days come back as nulls. Drop them rather than forward-filling: a
    // repeated close is a fabricated zero-return bar that shrinks ATR and
    // freezes RSI. Non-finite values must also never reach libsql, which
    // rejects them at the protocol level.
    if (close === null || !Number.isFinite(close)) continue;

    bars.push({
      date: sessionDate(ts[i], tz),
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close,
      adjClose: adj?.[i] ?? close, // absent for some futures and thin tickers
      volume: q.volume?.[i] ?? null,
    });
  }

  return { ticker, currency: result.meta.currency ?? "USD", bars };
}

/** Upserts a series. Chunked because libsql batches have a statement ceiling. */
export async function storeEquityHistory(series: EquitySeries): Promise<number> {
  const { ticker, currency, bars } = series;
  let written = 0;

  for (let i = 0; i < bars.length; i += 200) {
    const chunk = bars.slice(i, i + 200);
    await rawClient.batch(
      chunk.map((b) => ({
        sql: `INSERT INTO equity_prices_daily
                (ticker, date, open, high, low, close, adj_close, volume, currency, fetched_at)
              VALUES (?,?,?,?,?,?,?,?,?, datetime('now'))
              ON CONFLICT(ticker, date) DO UPDATE SET
                open=excluded.open, high=excluded.high, low=excluded.low,
                close=excluded.close, adj_close=excluded.adj_close,
                volume=excluded.volume, currency=excluded.currency,
                fetched_at=excluded.fetched_at`,
        args: [
          ticker, b.date, b.open, b.high, b.low, b.close, b.adjClose, b.volume, currency,
        ] as never[],
      })),
      "write",
    );
    written += chunk.length;
  }
  return written;
}

export type TrendDirection = "up" | "down" | "mixed";

export interface DailyTrend {
  ticker: string;
  /** Latest adjusted close, in the listing currency. */
  price: number;
  currency: string;
  smma39: number | null;
  smma100: number | null;
  smma200: number | null;
  /**
   * `up` when the MA ladder is fully stacked bullish (price > 39 > 100 > 200),
   * `down` when fully stacked bearish, `mixed` otherwise.
   *
   * Deliberately a three-state reading and not a score. It exists to say
   * whether the long-term structure AGREES with a 4h signal, and collapsing a
   * partial stack into a number would invite ranking on it — which nothing in
   * the evidence supports.
   */
  direction: TrendDirection;
  /** Distance from the 200-day SMMA, %. Context only. */
  distFrom200Pct: number | null;
  bars: number;
}

/** Loads the stored adjusted series for one ticker, oldest first. */
export async function loadAdjustedSeries(
  ticker: string,
): Promise<{ closes: number[]; currency: string }> {
  const rows = await rawClient.execute({
    sql: `SELECT adj_close, currency FROM equity_prices_daily
          WHERE ticker = ? AND adj_close IS NOT NULL
          ORDER BY date ASC`,
    args: [ticker] as never[],
  });
  const closes = rows.rows
    .map((r) => Number(r.adj_close))
    .filter((v) => Number.isFinite(v) && v > 0);
  const currency = String(rows.rows[0]?.currency ?? "USD");
  return { closes, currency };
}

/**
 * Long-term daily trend for one underlying. Null when history is too short —
 * the caller must show "no long-term read", never a partially converged one.
 */
export function computeDailyTrend(
  ticker: string,
  closes: number[],
  currency: string,
): DailyTrend | null {
  if (closes.length < DAILY_TREND_WARMUP) return null;

  const s39 = smmaSeries(closes, 39);
  const s100 = smmaSeries(closes, 100);
  const s200 = smmaSeries(closes, 200);

  const price = closes[closes.length - 1];
  const a = s39[s39.length - 1];
  const b = s100[s100.length - 1];
  const c = s200[s200.length - 1];

  let direction: TrendDirection = "mixed";
  if (a !== null && b !== null && c !== null) {
    if (price > a && a > b && b > c) direction = "up";
    else if (price < a && a < b && b < c) direction = "down";
  }

  return {
    ticker,
    price,
    currency,
    smma39: a,
    smma100: b,
    smma200: c,
    direction,
    distFrom200Pct: c ? (100 * (price - c)) / c : null,
    bars: closes.length,
  };
}
