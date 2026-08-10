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
  /**
   * A symbol's last bar must close within this many intervals of the run.
   *
   * Without it, a contract whose feed has stopped — halted for a corporate
   * action, or delisted mid-session — still returns 400 stale bars, still
   * scores, and is pushed as a live setup at a price that no longer trades.
   * The old freshness check took a `max` across the whole universe, so a single
   * healthy symbol masked every stale one.
   */
  maxStaleIntervals: 2,
} as const;

/** Interval length in ms, for the staleness gate. */
const INTERVAL_MS: Record<string, number> = {
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

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
  /**
   * Percentile of `avgQuoteVol` WITHIN this pick's category, 0-100.
   *
   * The tie-break, and the fix for the concentration bug. Ranking ties on raw
   * traded value handed the report to the tradfi book: equity perps are close
   * to one factor plus noise, so when the US cohort turns they all reach a
   * score of 3 together and enter the tie group as a correlated bloc, which a
   * volume sort then sweeps. Measured live, 7 of 8 longs were equities from
   * only 38 of 133 qualifiers. Ranking each name against its OWN category means
   * an equity at the 60th percentile of equity liquidity no longer outranks a
   * coin at the 95th percentile of crypto liquidity, and it costs no new
   * tunable constant.
   */
  liquidityPctl: number;
  /** True when this is the bar the score first crossed the threshold. */
  freshFlag: boolean;
  /**
   * Both directions cleared the threshold at the SAME score.
   *
   * These are recorded but never reported. Dropping them from the record
   * entirely (the previous behaviour) contradicted the whole reason the table
   * stores un-sent rows: it deleted 5.6% of long-qualifying observations, so no
   * later study could ever test whether "contested" carries information.
   */
  contested: boolean;
}

export interface ConvergenceResult {
  longs: ConvergencePick[];
  shorts: ConvergencePick[];
  /** Every name clearing the threshold, both sides, before the topN cut. */
  candidates: ConvergencePick[];
  funnel: {
    universe: number;
    withBars: number;
    /** Returned no bars at all. */
    noBars: number;
    /** Returned bars but fewer than the MCD warmup — the two used to be
     *  conflated, so a venue outage looked identical to a young contract. */
    tooShort: number;
    /** Dropped because the last bar was older than the staleness ceiling. */
    stale: number;
    scorable: number;
    liquid: number;
    qualified: number;
    /** Cleared the threshold on both sides at equal score; recorded, not sent. */
    contested: number;
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
    // Filled by selectConvergencePicks once the whole cross-section is known;
    // a percentile is meaningless for a single symbol in isolation.
    liquidityPctl: 0,
    contested: false,
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
 * Assigns each pick its within-category liquidity percentile, in place.
 *
 * Percentiles are computed per (category, side) group over the qualifying set,
 * which is the population the tie-break actually orders.
 */
export function assignLiquidityPercentiles(picks: ConvergencePick[]): void {
  const groups = new Map<string, ConvergencePick[]>();
  for (const p of picks) {
    const key = `${p.category}|${p.side}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }

  for (const group of Array.from(groups.values())) {
    // A single-member category is at its own top by definition. Computing
    // 100*0/1 = 0 for it would push the sole commodity or index name to the
    // bottom of every tie-break, which is the opposite of what within-category
    // ranking is for.
    if (group.length === 1) {
      group[0].liquidityPctl = 100;
      continue;
    }
    const sorted = [...group].sort((a, b) => a.avgQuoteVol - b.avgQuoteVol);
    sorted.forEach((p, i) => {
      p.liquidityPctl = Math.round((100 * i) / (sorted.length - 1));
    });
  }
}

/**
 * Ranking key.
 *
 * Score first, because that is the thing the screen is about. The tie-break is
 * NOT a second opinion on quality — with a 0-5 integer score, ties are the norm
 * (a typical day puts ~78% of qualifiers on exactly 3), and any return-based
 * tie-break would quietly reintroduce the momentum ranking this screen
 * replaced. It is within-category liquidity: among names the indicator likes
 * equally, prefer the one most tradable RELATIVE TO ITS OWN COHORT.
 *
 * `freshFlag` was previously the second key. It is gone from the ordering: it
 * is true only on the single bar the score crosses the threshold, and a daily
 * report over 4h bars sees just one of every six bars, so as a sort key it was
 * a 1-in-6 sampling artifact with no evidence behind it. It survives as a
 * display badge.
 *
 * `base` last makes the order deterministic.
 */
export function rankPicks(picks: ConvergencePick[]): ConvergencePick[] {
  return [...picks].sort(
    (a, b) =>
      b.score - a.score ||
      b.liquidityPctl - a.liquidityPctl ||
      a.base.localeCompare(b.base),
  );
}

/**
 * Chooses one side's top N with category-proportional allocation.
 *
 * A pure score sort hands the whole report to whichever category happens to
 * move as a bloc. Allocating slots in proportion to each category's share of
 * the qualifying set keeps the report's composition honest — if equities are
 * 29% of qualifiers they get ~29% of the slots, not 88% of them. Every
 * category present gets at least one slot, and any slots left over by rounding
 * go to the highest scores overall, so the cut never leaves seats empty.
 */
export function allocateByCategory(
  ranked: ConvergencePick[],
  topN: number,
): ConvergencePick[] {
  if (ranked.length <= topN) return ranked;

  const byCat = new Map<string, ConvergencePick[]>();
  for (const p of ranked) {
    const g = byCat.get(p.category);
    if (g) g.push(p);
    else byCat.set(p.category, [p]);
  }

  const total = ranked.length;
  const picked: ConvergencePick[] = [];
  const taken = new Set<ConvergencePick>();

  for (const [, group] of Array.from(byCat.entries())) {
    const slots = Math.max(1, Math.round((topN * group.length) / total));
    for (const p of group.slice(0, slots)) {
      picked.push(p);
      taken.add(p);
    }
  }

  // Rounding can overshoot or undershoot topN. Trim the weakest, or fill from
  // the best remaining, so the cut is exactly topN whenever supply allows.
  picked.sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b));
  if (picked.length > topN) return picked.slice(0, topN);
  for (const p of ranked) {
    if (picked.length >= topN) break;
    if (!taken.has(p)) picked.push(p);
  }
  return picked.sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b)).slice(0, topN);
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

  let noBars = 0;
  let tooShort = 0;
  let stale = 0;
  let scorable = 0;
  let liquid = 0;
  let contestedN = 0;
  let latestBarClose = 0;
  const candidates: ConvergencePick[] = [];
  const byCategory: Record<string, number> = {};

  const intervalMs = INTERVAL_MS[cfg.interval] ?? 14_400_000;
  const now = Date.now();

  for (const sym of symbols) {
    const bars = barMap.get(sym.symbol);
    if (!bars || bars.length === 0) {
      noBars++;
      continue;
    }
    if (bars.length < MCD_WARMUP) {
      tooShort++;
      continue;
    }

    // Per-symbol freshness. Checked before scoring so a halted contract cannot
    // reach the report at a price that no longer trades.
    const lastClose = bars[bars.length - 1].tClose;
    if (now - lastClose > intervalMs * cfg.maxStaleIntervals) {
      stale++;
      continue;
    }

    const scored = scoreSymbol(sym, bars, cfg);
    if (!scored) continue;
    scorable++;

    if (scored.avgQuoteVol < cfg.minAvgQuoteVol) continue;
    liquid++;
    latestBarClose = Math.max(latestBarClose, lastClose);

    // A name can clear the threshold in both directions — the factors are not
    // mutually exclusive (support and VSA fire on either side). Reporting it
    // twice would be reporting a coin flip as two convictions, so only the
    // stronger side is reportable. When the sides are LEVEL the name is still
    // recorded, flagged `contested`, so the control group keeps it.
    const { long, short } = scored;
    const both = long.score >= cfg.minScore && short.score >= cfg.minScore;

    let chosen: ConvergencePick | null = null;
    if (long.score > short.score && long.score >= cfg.minScore) chosen = long;
    else if (short.score > long.score && short.score >= cfg.minScore) chosen = short;
    else if (both && long.score === short.score) {
      // Level tie: record the long leg as the representative row rather than
      // dropping the observation. `contested` marks it un-reportable.
      chosen = { ...long, contested: true };
      contestedN++;
    }

    if (chosen) {
      candidates.push(chosen);
      byCategory[chosen.category] = (byCategory[chosen.category] ?? 0) + 1;
    }
  }

  assignLiquidityPercentiles(candidates);
  const ranked = rankPicks(candidates);

  // Contested names are recorded but never sent.
  const reportable = ranked.filter((p) => !p.contested);
  const longs = allocateByCategory(reportable.filter((p) => p.side === "long"), cfg.topN);
  const shorts = allocateByCategory(reportable.filter((p) => p.side === "short"), cfg.topN);

  const result: ConvergenceResult = {
    longs,
    shorts,
    candidates: ranked,
    funnel: {
      universe: symbols.length,
      withBars: barMap.size,
      noBars,
      tooShort,
      stale,
      scorable,
      liquid,
      qualified: candidates.length,
      contested: contestedN,
      byCategory,
    },
    // The bar CLOSE, not its open — the moment the scored data was complete.
    asOf: latestBarClose ? new Date(latestBarClose).toISOString() : new Date().toISOString(),
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
