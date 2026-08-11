/**
 * Historical positioning series — funding, open interest, taker flow.
 *
 * WHY THIS IS SEPARATE FROM `perp-positioning.ts`
 * ----------------------------------------------
 * That module fetches a SNAPSHOT: what open interest and funding read right
 * now, for the live screen to annotate a pick with. A backtest needs the same
 * quantities AS A SERIES, at every historical bar, and the venue's endpoints
 * for the two purposes have wildly different reach. Mixing them in one module
 * would hide that difference behind a shared name.
 *
 * WHAT THE VENUE ACTUALLY SERVES — MEASURED, NOT ASSUMED
 * -----------------------------------------------------
 * Probed against fapi.binance.com on 2026-08-11:
 *
 *   openInterestHist  ?period=4h&limit=500   ->  186 rows, 30.8 days
 *   openInterestHist  &startTime=-200d       ->  HTTP 400, "startTime is invalid"
 *   takerlongshortRatio ?period=4h&limit=500 ->  186 rows, 30.8 days
 *   fundingRate       ?limit=1000            ->  500 rows, 166 days
 *   fundingRate       ?limit=1000&startTime  ->  1000 rows
 *   fundingRate       -900d..-700d           ->  600 rows from 2024-02
 *
 * Three consequences that shape every study built on this module:
 *
 *  1. OPEN INTEREST AND TAKER FLOW ARE CAPPED AT 30 DAYS. Not a default that a
 *     larger `limit` lifts — `limit=500` returns 186 rows because the 30-day
 *     wall binds first, and `startTime` beyond it is rejected outright rather
 *     than silently returning less. At a 7-day horizon that is ~4
 *     non-overlapping observations. Nothing can be concluded from it, including
 *     about `oiChangeAbs`, which is what the live report currently ranks on.
 *
 *  2. FUNDING IS DEEP, BUT ONLY IF PAGED. The unpaged call caps at 500 rows
 *     (~166 days at 8h) — less than the ~500-day bar panel — and returns them
 *     without complaint. A fetcher that omits `startTime` produces a funding
 *     series covering the last third of the study and nothing announces it.
 *     Paging backwards with `startTime` reaches 2024 and beyond.
 *
 *  3. THE FUNDING INTERVAL IS PER-SYMBOL. Every symbol sampled here settles at
 *     8h, but Binance runs some contracts on 4h under adaptive funding, so the
 *     interval is INFERRED from the median gap between settlements rather than
 *     assumed. Timestamps carry clock jitter — NVDAUSDT reads 7.9999997h — so
 *     the inference rounds.
 *
 * RETRY IS NOT OPTIONAL HERE
 * -------------------------
 * `perp-positioning.ts`'s `getJson` returns null on 429 and moves on, which is
 * right for a snapshot that annotates a report and wrong for a dataset: 678
 * symbols against the weight-limited `/futures/data/*` family will throttle,
 * and silent nulls would put holes across a third of the universe that later
 * read as "this signal has low coverage" rather than "the fetch failed".
 */
import { logger } from "@/lib/logger";

const BINANCE_BASE = process.env.BINANCE_API_BASE ?? "https://fapi.binance.com";
const BINANCE_DATA = `${BINANCE_BASE}/futures/data`;
const BINANCE_FAPI = `${BINANCE_BASE}/fapi/v1`;

/** One funding settlement. `t` is the settlement time in epoch ms. */
export interface FundingPoint {
  t: number;
  /** Rate as a fraction per settlement, e.g. 0.0001 = 1bp. */
  rate: number;
}

/** One open-interest observation. */
export interface OiPoint {
  t: number;
  /** Open interest in contracts. */
  oi: number;
  /** Notional open interest in quote currency. */
  oiValue: number;
}

/** One taker buy/sell ratio observation. */
export interface TakerPoint {
  t: number;
  /** Taker buy volume / taker sell volume. Above 1 = buyers crossing. */
  ratio: number;
}

export interface PositioningHistory {
  symbol: string;
  /** Ascending, deduped, paged as deep as the venue allows. */
  funding: FundingPoint[];
  /**
   * Median settlement interval in ms, inferred from `funding`. Null when there
   * are too few settlements to infer one. Callers must not assume 8h.
   */
  fundingIntervalMs: number | null;
  /** Ascending. Empty or ~30 days only — see the module docstring. */
  oi: OiPoint[];
  /** Ascending. Empty or ~30 days only. */
  taker: TakerPoint[];
}

/** Venue reach for the 30-day-capped endpoints, so callers can assert on it. */
export const OI_HISTORY_DAYS = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with backoff on the venue's rate-limit responses.
 *
 * 429 is "slow down", 418 is "you have been temporarily banned for ignoring
 * 429". Both are retried with growing delay; anything else fails fast, because
 * retrying a 400 just spends the budget that the next symbol needs.
 */
async function getJsonRetry<T>(url: string, attempts = 4): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 429 || res.status === 418) {
        await sleep(2000 * (i + 1));
        continue;
      }
      return null;
    } catch {
      await sleep(1000 * (i + 1));
    }
  }
  return null;
}

/**
 * Full funding history, paged backwards from `startTime`.
 *
 * The venue returns at most 1000 rows per call and only honours the full 1000
 * when `startTime` is supplied, so paging is what makes this deep rather than
 * an optimisation. Pages walk FORWARD from an early anchor and stop when a page
 * comes back short, which is the venue's signal that it has run out.
 */
export async function fetchFundingSeries(
  symbol: string,
  lookbackDays = 600,
): Promise<FundingPoint[]> {
  const out = new Map<number, number>();
  let cursor = Date.now() - lookbackDays * 86_400_000;

  for (let page = 0; page < 12; page++) {
    const rows = await getJsonRetry<{ fundingRate: string; fundingTime: number }[]>(
      `${BINANCE_FAPI}/fundingRate?symbol=${symbol}&limit=1000&startTime=${cursor}`,
    );
    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      const rate = Number(r.fundingRate);
      if (Number.isFinite(rate)) out.set(r.fundingTime, rate);
    }

    const last = rows[rows.length - 1].fundingTime;
    // A short page means the venue has nothing further. Advancing past `last`
    // by 1ms avoids re-requesting the boundary row forever.
    if (rows.length < 1000 || last <= cursor) break;
    cursor = last + 1;
  }

  return Array.from(out.entries())
    .map(([t, rate]) => ({ t, rate }))
    .sort((a, b) => a.t - b.t);
}

/**
 * Median gap between settlements, in ms.
 *
 * The median, not the mean: a contract listed mid-history or a venue outage
 * leaves one enormous gap that would drag a mean into meaninglessness. Rounded
 * to the nearest hour because settlement timestamps carry clock jitter.
 */
export function inferFundingInterval(funding: FundingPoint[]): number | null {
  if (funding.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < funding.length; i++) gaps.push(funding[i].t - funding[i - 1].t);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (!Number.isFinite(median) || median <= 0) return null;
  return Math.round(median / 3_600_000) * 3_600_000;
}

/** Open-interest history. Only ~30 days exist, whatever `limit` says. */
export async function fetchOiHistory(symbol: string, period = "4h"): Promise<OiPoint[]> {
  const rows = await getJsonRetry<
    { sumOpenInterest: string; sumOpenInterestValue: string; timestamp: number }[]
  >(`${BINANCE_DATA}/openInterestHist?symbol=${symbol}&period=${period}&limit=500`);
  if (!rows) return [];
  return rows
    .map((r) => ({
      t: r.timestamp,
      oi: Number(r.sumOpenInterest),
      oiValue: Number(r.sumOpenInterestValue),
    }))
    .filter((p) => Number.isFinite(p.oi) && Number.isFinite(p.oiValue))
    .sort((a, b) => a.t - b.t);
}

/** Taker buy/sell ratio history. Also ~30 days only. */
export async function fetchTakerHistory(symbol: string, period = "4h"): Promise<TakerPoint[]> {
  const rows = await getJsonRetry<{ buySellRatio: string; timestamp: number }[]>(
    `${BINANCE_DATA}/takerlongshortRatio?symbol=${symbol}&period=${period}&limit=500`,
  );
  if (!rows) return [];
  return rows
    .map((r) => ({ t: r.timestamp, ratio: Number(r.buySellRatio) }))
    .filter((p) => Number.isFinite(p.ratio))
    .sort((a, b) => a.t - b.t);
}

/**
 * Fetches every series for every symbol, at a concurrency the venue tolerates.
 *
 * Concurrency 4, not the 5-6 the bar fetchers use: this issues three requests
 * per symbol against two endpoint families, one of which (`/futures/data/*`)
 * carries its own IP budget separate from the kline weight.
 */
export async function fetchPositioningHistoryForAll(
  symbols: string[],
  opts: { concurrency?: number; lookbackDays?: number; onProgress?: (done: number) => void } = {},
): Promise<Map<string, PositioningHistory>> {
  const { concurrency = 4, lookbackDays = 600, onProgress } = opts;
  const out = new Map<string, PositioningHistory>();
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor++];
      try {
        const funding = await fetchFundingSeries(symbol, lookbackDays);
        const oi = await fetchOiHistory(symbol);
        const taker = await fetchTakerHistory(symbol);
        out.set(symbol, {
          symbol,
          funding,
          fundingIntervalMs: inferFundingInterval(funding),
          oi,
          taker,
        });
      } catch (err) {
        logger.warn("perp-positioning-history", "Symbol fetch failed", { symbol, error: err });
      }
      if (onProgress) onProgress(++done);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

/**
 * Funding cost realized over a forward window, as a percentage.
 *
 * THIS REPLACES A LOOK-AHEAD. The existing backtest charges each name its
 * FULL-SAMPLE MEAN funding rate at every historical timestamp
 * (`run-perp-convergence-backtest.ts`, `loadFunding`), so a contract whose
 * funding blew out in month ten is charged that rate in month one. Funding
 * level correlates with exactly the crowded, trending names a momentum signal
 * selects, so the error is not noise — it is a cost that leaks information
 * about the future into the ranking's own cost model.
 *
 * Positive means longs paid. Callers flip the sign for shorts.
 */
export function fundingCostOver(
  funding: FundingPoint[],
  fromMs: number,
  toMs: number,
): number {
  if (!funding.length || toMs <= fromMs) return 0;
  let sum = 0;
  for (const f of funding) {
    if (f.t <= fromMs) continue;
    if (f.t > toMs) break;
    sum += f.rate;
  }
  return sum * 100;
}
