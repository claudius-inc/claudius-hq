/**
 * Multi-timeframe moves — see docs/daily-note-v2-spec.md §D.
 *
 * Computed as `adjclose[last] / adjclose[last − N] − 1` from ONE chart response,
 * with both the raw and adjusted series retained so a split can be detected.
 *
 * Two naming decisions matter. They are called 5-session and 21-session, never
 * "1 week" and "1 month", so a holiday-shortened stretch never turns the label
 * into a lie. And nothing is stored: `adjclose` is retroactively rewritten by
 * every split and dividend, so a cached copy goes stale by construction, which
 * is why the repo's labelling pipeline also refetches rather than trusting its
 * own price table.
 */
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";
import { acquireYahooSlot } from "@/lib/scanner/yahoo-rate-limiter";
import { etDate } from "@/lib/notes/session";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/timeframes";

export const WINDOW_5 = 5;
export const WINDOW_21 = 21;

/**
 * Raw-vs-adjusted disagreement beyond this is a split or a data defect, and the
 * figure is dropped rather than printed.
 *
 * The repo's labelling module uses a flat 6%, but that constant is calibrated
 * for multi-week horizons where dividends can genuinely accumulate. Over five
 * sessions dividends explain at most ~1-2%, so importing 6% would let a 4-5%
 * defect through — enough to flip the sign of the figure. Scale with the window.
 */
function toleranceFor(window: number): number {
  return window <= WINDOW_5 ? 2 : 4;
}

export type { TimeframeMove } from "@/lib/notes/types";
import type { TimeframeMove } from "@/lib/notes/types";

interface Bar {
  date: Date;
  close: number;
  adjclose: number;
}

/** Percent change over `window` bars, or null when the series disagrees. */
function windowChange(bars: Bar[], window: number, symbol: string): number | null {
  if (bars.length < window + 1) return null;
  const last = bars[bars.length - 1];
  const prior = bars[bars.length - 1 - window];
  if (!prior || prior.adjclose === 0 || prior.close === 0) return null;

  const adjPct = (last.adjclose / prior.adjclose - 1) * 100;
  const rawPct = (last.close / prior.close - 1) * 100;

  // Both legs come from the same array of the same response, so an adjusted leg
  // can never be compared against a raw one by accident.
  if (Math.abs(adjPct - rawPct) > toleranceFor(window)) {
    logger.warn(SRC, "Series disagree — omitting figure", {
      symbol,
      window,
      adjPct: Math.round(adjPct * 100) / 100,
      rawPct: Math.round(rawPct * 100) / 100,
    });
    return null;
  }
  return Math.round(adjPct * 100) / 100;
}

/**
 * Fetch 5- and 21-session moves for a handful of symbols. Intended for the ~20
 * benchmarks plus the relevance union — never the full index, which would be
 * hundreds of history calls.
 */
export async function fetchTimeframes(symbols: string[], marketDate: string): Promise<TimeframeMove[]> {
  const out: TimeframeMove[] = [];

  for (const symbol of symbols) {
    try {
      await acquireYahooSlot();
      const chart = (await yahooFinance.chart(symbol, {
        // ~5 months of calendar days comfortably covers 21 trading bars plus
        // holidays, without pulling a year of history per symbol.
        period1: new Date(Date.now() - 150 * 86_400_000),
        interval: "1d",
      })) as { quotes?: { date?: Date; close?: number | null; adjclose?: number | null }[] };

      const bars: Bar[] = (chart?.quotes ?? [])
        .filter(
          (b): b is { date: Date; close: number; adjclose: number } =>
            b?.date != null &&
            b.close != null &&
            b.adjclose != null &&
            Number.isFinite(b.close) &&
            Number.isFinite(b.adjclose),
        )
        .map((b) => ({ date: b.date, close: b.close, adjclose: b.adjclose }));

      if (bars.length === 0) continue;

      // Drop a bar for a session that has not closed. The note runs post-close,
      // but workflow_dispatch can fire at any hour.
      const lastDate = etDate(bars[bars.length - 1].date.getTime());
      if (lastDate > marketDate) bars.pop();
      if (bars.length === 0) continue;

      out.push({
        symbol,
        chg5s: windowChange(bars, WINDOW_5, symbol),
        chg21s: windowChange(bars, WINDOW_21, symbol),
        asOfDate: etDate(bars[bars.length - 1].date.getTime()),
      });
    } catch (error) {
      logger.warn(SRC, "Timeframe fetch failed", { symbol, error });
    }
  }

  logger.info(SRC, "Timeframes computed", { requested: symbols.length, returned: out.length });
  return out;
}
