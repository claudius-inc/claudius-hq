/**
 * Selection logic for the daily "Convergence" Telegram report.
 *
 * WHAT THIS REPLACES
 * ------------------
 * Two separate daily pushes, on two different universes, with two different
 * notions of "good":
 *   - Crypto Movers    — CoinGecko top 1000, ranked on a return composite
 *   - Momentum Gainers — HQ-bookmarked equities, ranked on technical structure
 * Both are retired. One universe (perps that are actually tradable), one score
 * (indicator convergence), one message, and both directions rather than longs
 * only — on a perp venue a short is the same trade with the sign flipped, and
 * excluding shorts threw away half the opportunity set.
 *
 * WHY 4-HOUR BARS
 * ---------------
 * Forced by the data, not chosen for taste. The tradfi perps are new: NVDA has
 * ~138 daily bars, SPCX ~82, ANTHROPIC ~77. MCD's SMMA-200 needs 200 bars and
 * wants a few hundred for the RMA to converge, so on a DAILY timeframe not one
 * equity or pre-IPO perp can be scored at all — the exact names this screen
 * exists to cover. On 4h the thinnest name still has ~414 bars. The report is
 * still sent once a day; only the bar size changed.
 *
 * A WARNING ABOUT THE RANKING
 * ---------------------------
 * The convergence count has NOT been shown to predict forward returns. A
 * backtest over ~250 days of 4h bars across 620 perps found the net score's
 * information coefficient significantly NEGATIVE at 1 and 3 days, no single
 * factor significantly positive in its intended direction, and no monotone
 * relationship between score and forward excess return. See
 * `scripts/research/run-perp-convergence-backtest.ts`.
 *
 * That is why `selectConvergencePicks` returns every CANDIDATE and not just the
 * reported few, and why the pipeline persists them with an entry-price anchor:
 * the ranking is a hypothesis under test, and the stored rows are what will
 * eventually confirm or kill it out-of-sample. This mirrors how
 * `momentum_report_picks` was used to falsify the old momentum-delta ranking.
 */
import {
  VENUES,
  fetchBarsForAll,
  type PerpBar,
  type PerpCategory,
  type PerpSymbol,
  type PerpVenue,
} from "@/lib/markets/perp-venues";
import { computeMcdSeries, MCD_WARMUP, MCD_CONFIG, type McdBar, type McdFactors } from "@/lib/markets/mcd";
import { logger } from "@/lib/logger";

export const CONVERGENCE_CONFIG = {
  interval: "4h" as const,
  /** Warmup (300) plus headroom, and cheap: Binance weights limit<=500 at 2. */
  barLimit: 400,
  /**
   * Minimum traded value per 4h bar, averaged over the last 30 bars (5 days).
   * $250k/bar is ~$1.5M/day — below that the book is too thin for a position
   * to be entered and exited without the slippage swamping the signal.
   */
  minAvgQuoteVol: 250_000,
  /** Matches the indicator's own default flag threshold. */
  minScore: MCD_CONFIG.minScore,
  /** Per side. */
  topN: 8,
  /** Bars used for the liquidity average and the displayed move. */
  liquidityBars: 30,
} as const;

export type ConvergenceConfig = typeof CONVERGENCE_CONFIG;

export type Side = "long" | "short";

export interface ConvergencePick {
  venue: string;
  symbol: string;
  base: string;
  category: PerpCategory;
  side: Side;
  score: number;
  maxScore: number;
  factors: McdFactors;
  /** The opposing score, kept so a contested name is visible as contested. */
  opposingScore: number;
  price: number;
  rsi: number | null;
  /** Percent change over `liquidityBars` bars — context, never a ranking key. */
  changePct: number | null;
  avgQuoteVol: number;
  /** True when this is the bar the score first crossed the threshold. */
  freshFlag: boolean;
}

export interface ConvergenceResult {
  longs: ConvergencePick[];
  shorts: ConvergencePick[];
  /** Every name clearing the threshold, both sides, before the topN cut. */
  candidates: ConvergencePick[];
  funnel: {
    universe: number;
    withBars: number;
    scorable: number;
    liquid: number;
    qualified: number;
    byCategory: Record<string, number>;
  };
  /** Bar close time the scores were computed from, ISO. */
  asOf: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Scores one symbol's bars. Returns null when the history is too short to score
 * or the book is too thin to trade.
 */
export function scoreSymbol(
  sym: PerpSymbol,
  bars: PerpBar[],
  cfg: ConvergenceConfig = CONVERGENCE_CONFIG,
): { long: ConvergencePick; short: ConvergencePick; avgQuoteVol: number } | null {
  if (bars.length < MCD_WARMUP) return null;

  const tail = bars.slice(-cfg.liquidityBars);
  const avgQuoteVol = mean(tail.map((b) => b.q).filter((x) => Number.isFinite(x)));

  const mcdBars: McdBar[] = bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
  const series = computeMcdSeries(mcdBars);
  const r = series[series.length - 1];

  const first = tail[0]?.c;
  const changePct = first ? (100 * (r.close - first)) / first : null;

  const base = {
    venue: sym.venue,
    symbol: sym.symbol,
    base: sym.base,
    category: sym.category,
    maxScore: r.maxScore,
    price: r.close,
    rsi: r.rsi,
    changePct,
    avgQuoteVol,
  };

  return {
    avgQuoteVol,
    long: {
      ...base,
      side: "long",
      score: r.longScore,
      factors: r.longFactors,
      opposingScore: r.shortScore,
      freshFlag: r.longFlag,
    },
    short: {
      ...base,
      side: "short",
      score: r.shortScore,
      factors: r.shortFactors,
      opposingScore: r.longScore,
      freshFlag: r.shortFlag,
    },
  };
}

/**
 * Ranking key.
 *
 * Score first, because that is the thing the screen is about. The tie-break is
 * NOT a second opinion on quality — with a 0-5 integer score, ties are the norm
 * (a typical day puts dozens of names on 3), and any return-based tie-break
 * would quietly reintroduce the momentum ranking this screen replaced. It is
 * liquidity instead: among names the indicator likes equally, prefer the one
 * that can actually be traded. `base` last makes the order deterministic.
 */
function rankPicks(picks: ConvergencePick[]): ConvergencePick[] {
  return [...picks].sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.freshFlag) - Number(a.freshFlag) ||
      b.avgQuoteVol - a.avgQuoteVol ||
      a.base.localeCompare(b.base),
  );
}

/**
 * Runs the screen end to end: universe -> bars -> score -> filter -> rank.
 *
 * Sends nothing and writes nothing; the pipeline script owns both.
 */
export async function selectConvergencePicks(
  venueName = "binance",
  cfg: ConvergenceConfig = CONVERGENCE_CONFIG,
): Promise<ConvergenceResult> {
  const venue: PerpVenue | undefined = VENUES[venueName];
  if (!venue) throw new Error(`Unknown venue "${venueName}"`);

  const symbols = await venue.listSymbols();
  const barMap = await fetchBarsForAll(venue, symbols, cfg.interval, cfg.barLimit);

  let scorable = 0;
  let liquid = 0;
  let latestBarTime = 0;
  const candidates: ConvergencePick[] = [];
  const byCategory: Record<string, number> = {};

  for (const sym of symbols) {
    const bars = barMap.get(sym.symbol);
    if (!bars) continue;

    const scored = scoreSymbol(sym, bars, cfg);
    if (!scored) continue;
    scorable++;

    if (scored.avgQuoteVol < cfg.minAvgQuoteVol) continue;
    liquid++;
    latestBarTime = Math.max(latestBarTime, bars[bars.length - 1].t);

    // A name can clear the threshold in both directions — the factors are not
    // mutually exclusive (support and VSA fire on either side). Reporting it
    // twice would be reporting a coin flip as two convictions, so it goes to
    // the stronger side only, and is dropped outright when the sides are level.
    const { long, short } = scored;
    const sides: ConvergencePick[] = [];
    if (long.score > short.score && long.score >= cfg.minScore) sides.push(long);
    else if (short.score > long.score && short.score >= cfg.minScore) sides.push(short);

    for (const p of sides) {
      candidates.push(p);
      byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
    }
  }

  const ranked = rankPicks(candidates);
  const longs = ranked.filter((p) => p.side === "long").slice(0, cfg.topN);
  const shorts = ranked.filter((p) => p.side === "short").slice(0, cfg.topN);

  const result: ConvergenceResult = {
    longs,
    shorts,
    candidates: ranked,
    funnel: {
      universe: symbols.length,
      withBars: barMap.size,
      scorable,
      liquid,
      qualified: candidates.length,
      byCategory,
    },
    asOf: latestBarTime ? new Date(latestBarTime).toISOString() : new Date().toISOString(),
  };

  logger.info("convergence-screen", "Screen complete", {
    venue: venueName,
    ...result.funnel,
    longs: longs.length,
    shorts: shorts.length,
    asOf: result.asOf,
  });

  return result;
}
