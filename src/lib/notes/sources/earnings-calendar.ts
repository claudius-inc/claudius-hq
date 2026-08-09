/**
 * Who reported, when, and against what estimate — see docs/daily-note-v2-spec.md §A/§B.
 *
 * Finnhub's earnings calendar is free (its *economic* calendar is not) and one
 * call returns the whole day: symbol, date, an explicit `bmo`/`amc` session
 * half, epsEstimate, epsActual and revenue on both sides.
 *
 * The explicit `hour` matters more than the numbers. Yahoo's `earningsTimestamp`
 * is only a session-half placeholder, so classifying a report from it is
 * inference; Finnhub states it. Yahoo remains the corroborating second source.
 *
 * CONSENSUS IS CONTESTED. For one recent quarter Yahoo put AKAM's estimate at
 * 1.57684 and Finnhub at 1.6052, against the same 1.59 actual — a beat by one
 * source and a miss by the other. Both are reputable; they poll different
 * analyst sets and cut off at different times. So the beat/miss verdict is only
 * ever asserted when both agree on the SIGN of the surprise (see §B).
 */
import { logger } from "@/lib/logger";

const SRC = "notes/earnings-calendar";

export interface EarningsReport {
  ticker: string;
  /** ET calendar date of the report. */
  date: string;
  /** "bmo" = before open, "amc" = after close, null when unstated. */
  half: "bmo" | "amc" | null;
  epsActual: number | null;
  /** Finnhub's consensus. Deliberately NOT merged with Yahoo's — see file header. */
  epsEstimate: number | null;
}

interface FinnhubRow {
  symbol?: string;
  date?: string;
  hour?: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
}

/**
 * Reports dated in [from, to] (ET dates, inclusive), keyed by ticker.
 * Returns an empty map when no key is configured or the call fails — the
 * attribution ladder then falls back to Yahoo's placeholder stamp (§1a: degrade,
 * never invent).
 */
export async function fetchEarningsCalendar(from: string, to: string): Promise<Map<string, EarningsReport>> {
  const out = new Map<string, EarningsReport>();
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    logger.info(SRC, "FINNHUB_API_KEY not set — falling back to the Yahoo stamp");
    return out;
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      logger.warn(SRC, `Earnings calendar fetch failed: ${res.status}`);
      return out;
    }
    const json = (await res.json()) as { earningsCalendar?: FinnhubRow[] };
    const rows = json.earningsCalendar ?? [];
    for (const r of rows) {
      if (!r.symbol || !r.date) continue;
      const half = r.hour === "bmo" || r.hour === "amc" ? r.hour : null;
      // A ticker can appear twice across a multi-day window; the later report wins.
      const prev = out.get(r.symbol);
      if (prev && prev.date > r.date) continue;
      out.set(r.symbol, {
        ticker: r.symbol,
        date: r.date,
        half,
        epsActual: typeof r.epsActual === "number" ? r.epsActual : null,
        epsEstimate: typeof r.epsEstimate === "number" ? r.epsEstimate : null,
      });
    }
    logger.info(SRC, "Earnings calendar loaded", { from, to, rows: rows.length, tickers: out.size });
  } catch (error) {
    logger.warn(SRC, "Earnings calendar error", { error });
  }
  return out;
}
