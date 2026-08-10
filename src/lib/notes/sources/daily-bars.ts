/**
 * Daily bars for a single symbol, keyed by ET date.
 *
 * The weekly wrap's divergence follow-through (§C) is the reason this exists.
 * A flagged name's SUBSEQUENT closes were never stored — a constituent's move is
 * persisted only on the days it was flagged or ranked — so resolving "did that
 * flag hold?" means fetching. The spec allows it: the wrap is built from the
 * stored notes "plus a few fresh fetches".
 *
 * Keeping this separate from `timeframes.ts` is deliberate even though the two
 * fetch the same endpoint. Timeframes asks "how far has this moved over the last
 * N bars", which is anchored to the end of the series. Follow-through asks "how
 * far has this moved between two specific dates", which is anchored to a session
 * that may sit anywhere inside the range. Collapsing them would mean one
 * function with two mutually exclusive modes.
 */
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";
import { acquireYahooSlot } from "@/lib/scanner/yahoo-rate-limiter";
import { etDate } from "@/lib/notes/session";
import { toleranceFor } from "@/lib/notes/timeframes";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/daily-bars";

/**
 * SPDR writes share classes with a dot (BRK.B); Yahoo wants a dash (BRK-B).
 * Every stored ticker comes from the SPDR holdings files, so anything going to
 * Yahoo has to pass through here or the quote silently comes back empty.
 */
export function toYahooSymbol(ticker: string): string {
  return ticker.replace(/\./g, "-");
}

export interface DailyBar {
  /** ET calendar date, YYYY-MM-DD. */
  date: string;
  close: number;
  adjclose: number;
}

/**
 * Bars from `fromDate` onward, keyed by ET date. An empty map means the fetch
 * failed or the symbol has no history — the caller must treat that as "not
 * checkable", never as "no change".
 */
export async function fetchDailyBars(symbol: string, fromDate: string): Promise<Map<string, DailyBar>> {
  const out = new Map<string, DailyBar>();
  try {
    await acquireYahooSlot();
    const chart = (await yahooFinance.chart(symbol, {
      period1: new Date(`${fromDate}T00:00:00Z`),
      interval: "1d",
    })) as { quotes?: { date?: Date; close?: number | null; adjclose?: number | null }[] };

    for (const q of chart?.quotes ?? []) {
      if (q?.date == null || q.close == null || q.adjclose == null) continue;
      if (!Number.isFinite(q.close) || !Number.isFinite(q.adjclose)) continue;
      const date = etDate(q.date.getTime());
      out.set(date, { date, close: q.close, adjclose: q.adjclose });
    }
  } catch (error) {
    logger.warn(SRC, "Daily bar fetch failed", { symbol, error });
  }
  return out;
}

/**
 * Percent change between two ET dates, from the adjusted series, or null when
 * the window cannot be measured honestly.
 *
 * Null on: either date missing a bar (a flag made on a day the symbol did not
 * trade), a zero base, or raw-vs-adjusted disagreement past the §D tolerance —
 * which is a split or a data defect and can flip the sign of the answer. The
 * tolerance scales with the number of sessions spanned, borrowed from
 * `timeframes.ts` rather than re-picked here, because two different tolerances
 * for the same question is how they drift apart.
 */
export function changeBetween(
  bars: Map<string, DailyBar>,
  fromDate: string,
  toDate: string,
  symbol: string,
): number | null {
  const from = bars.get(fromDate);
  const to = bars.get(toDate);
  if (!from || !to) return null;
  if (from.close === 0 || from.adjclose === 0) return null;

  const adjPct = (to.adjclose / from.adjclose - 1) * 100;
  const rawPct = (to.close / from.close - 1) * 100;

  // Sessions actually spanned, so a Monday-to-Friday window is not judged
  // against a 21-session tolerance.
  const spanned = Array.from(bars.keys()).filter((d) => d > fromDate && d <= toDate).length;
  if (Math.abs(adjPct - rawPct) > toleranceFor(spanned)) {
    logger.warn(SRC, "Series disagree over the window — omitting", {
      symbol,
      fromDate,
      toDate,
      adjPct: Math.round(adjPct * 100) / 100,
      rawPct: Math.round(rawPct * 100) / 100,
    });
    return null;
  }
  return Math.round(adjPct * 100) / 100;
}
