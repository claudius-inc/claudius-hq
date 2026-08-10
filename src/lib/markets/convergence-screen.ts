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
import { fetchOiChangeForAll } from "@/lib/markets/perp-positioning";
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
  /**
   * Extra points for agreeing with quarterly anchored VWAP.
   *
   * The five MCD factors are a plain count, which treats them as equally
   * informative — and measurement says they are not: `support` and `vsa` fire
   * on ~60% and ~49% of bars while contributing an edge indistinguishable from
   * zero (t = -0.01 and +0.10 over 199,553 observations). Quarterly VWAP is the
   * level real size is benchmarked against for the quarter, so it is weighted
   * above any single one of them rather than being one more tally mark.
   *
   * At weight 2 the maximum is 7 (five factors plus this).
   *
   * The threshold is 5, not 4. Price is always on ONE side of VWAP, so every
   * name collects 2 points on one side for free; at a threshold of 4 that plus
   * the two near-noise factors (`support` 60% and `vsa` 49% fire rates) clears
   * the bar by itself — measured live, 340 of 432 liquid names qualified, which
   * is a list of everything. At 5 a name needs VWAP agreement AND three of the
   * five factors, which is the old 3-of-5 selectivity with VWAP made mandatory.
   * A name that disagrees with quarterly VWAP now needs all five factors, which
   * is what weighting it above the others means in practice.
   */
  vwapWeight: 2,
  /** Threshold on the WEIGHTED score, out of `5 + vwapWeight`. */
  minScore: 5,
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
  /**
   * Correlation ceiling for the reported set.
   *
   * The report's 16 slots were worth about 1-2 independent looks. Equity perps
   * are roughly one factor plus noise, so when the US cohort turns they reach a
   * score of 3 together and enter the list as a bloc; the same happens to
   * majors and to whatever sector is moving in crypto. Category-proportional
   * allocation bounds the mix but not the redundancy WITHIN a category — two
   * L1s at 0.95 correlation are still one bet. A name is skipped when its
   * trailing return correlation with an already-selected name exceeds this.
   */
  maxCorrelation: 0.8,
  /** Bars of returns used for the correlation estimate. */
  correlationBars: 60,
  /**
   * Days a reported name is suppressed before it can be reported again.
   *
   * The retired momentum screen had this and the consolidation dropped it. For
   * a list meant to surface things worth LOOKING at, a name you saw yesterday
   * and passed on is a wasted slot — it is not new information. Candidates are
   * still recorded every day; only the reporting is suppressed.
   */
  cooldownDays: 3,
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
  /** Weighted: the five MCD factors at 1 point each, plus quarterly VWAP at
   *  `vwapWeight`. Out of `maxScore`. */
  score: number;
  maxScore: number;
  factors: McdFactors;
  /** Whether price sits on this side's half of quarterly anchored VWAP. */
  vwapAgrees: boolean;
  /** Open-interest change over the lookback, %. Signed. */
  oiChangePct: number | null;
  /**
   * Percentile of |OI change| across the qualifying set, 0-100 — the PRIMARY
   * ranking key when open-interest data is available.
   *
   * Ranking on convergence was measured at 0.93x random for containing big
   * movers; ranking on |OI change| measured 1.89x. Since the shortlist exists
   * to be looked at rather than acted on blindly, "something is happening here"
   * beats "the indicators agree" as an ordering principle. Convergence and VWAP
   * remain as the gate and as annotation.
   */
  oiPctl: number | null;
  /** Quarterly anchored VWAP level, null when the quarter is too young. */
  qvwap: number | null;
  /** Distance from quarterly VWAP, %. Signed: positive means above. */
  vwapDistPct: number | null;
  /** The opposing score, kept so a contested name is visible as contested. */
  opposingScore: number;
  price: number;
  rsi: number | null;
  /**
   * Self-volatility percentile, 0-100. Low = coiled, high = already moving.
   *
   * Reported because the convergence count was measured to be, in practice, a
   * compression reading: a score of 5 averages 0.68x its category's typical
   * 1-day move while a score of 1 averages 1.35x, monotonically. Showing the
   * percentile lets that be judged rather than hidden inside the score.
   */
  volPctl: number | null;
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
    /** Qualified but reported too recently to be new information. */
    cooldownSkipped: number;
    /** Qualified but too correlated with a name already on the list. */
    correlationSkipped: number;
    byCategory: Record<string, number>;
  };
  /** Bar close time the scores were computed from, ISO. */
  asOf: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Volume-weighted average price anchored to the start of the current calendar
 * quarter.
 *
 * Anchored, not rolling. A rolling 90-day VWAP drifts every bar and answers a
 * different question; the anchored one is a fixed level for the quarter, which
 * is what makes it a reference everyone is measured against rather than another
 * moving average. Uses the typical price (H+L+C)/3 weighted by base volume.
 *
 * Returns null when the quarter is too young to be meaningful — early April,
 * an anchored VWAP is two days of data pretending to be a quarterly level.
 */
export function quarterlyVwap(bars: PerpBar[], minBars = 30): number | null {
  if (!bars.length) return null;
  const last = new Date(bars[bars.length - 1].tClose);
  const qStart = Date.UTC(last.getUTCFullYear(), Math.floor(last.getUTCMonth() / 3) * 3, 1);

  let pv = 0;
  let vol = 0;
  let n = 0;
  for (const b of bars) {
    if (b.t < qStart) continue;
    const typical = (b.h + b.l + b.c) / 3;
    if (!Number.isFinite(typical) || !Number.isFinite(b.v) || b.v <= 0) continue;
    pv += typical * b.v;
    vol += b.v;
    n++;
  }
  if (n < minBars || vol <= 0) return null;
  return pv / vol;
}

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

  // Quarterly VWAP carries `vwapWeight` points, not one — see CONVERGENCE_CONFIG.
  const qvwap = quarterlyVwap(bars);
  const aboveVwap = qvwap !== null ? r.close > qvwap : null;
  const vwapDistPct = qvwap ? (100 * (r.close - qvwap)) / qvwap : null;
  const longVwapPts = aboveVwap === true ? cfg.vwapWeight : 0;
  const shortVwapPts = aboveVwap === false ? cfg.vwapWeight : 0;

  const base = {
    venue: sym.venue,
    symbol: sym.symbol,
    base: sym.base,
    category: sym.category,
    // Filled by selectConvergencePicks once the whole cross-section is known;
    // a percentile is meaningless for a single symbol in isolation.
    liquidityPctl: 0,
    // Both filled by selectConvergencePicks once the cross-section is known.
    oiChangePct: null,
    oiPctl: null,
    contested: false,
    maxScore: r.maxScore + cfg.vwapWeight,
    qvwap,
    vwapDistPct,
    price: r.close,
    rsi: r.rsi,
    volPctl: r.volPctl,
    changePct,
    avgQuoteVol,
  };

  return {
    avgQuoteVol,
    long: {
      ...base,
      side: "long",
      score: r.longScore + longVwapPts,
      factors: r.longFactors,
      vwapAgrees: aboveVwap === true,
      opposingScore: r.shortScore + shortVwapPts,
      freshFlag: r.longFlag,
    },
    short: {
      ...base,
      side: "short",
      score: r.shortScore + shortVwapPts,
      factors: r.shortFactors,
      vwapAgrees: aboveVwap === false,
      opposingScore: r.longScore + longVwapPts,
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
  const haveOi = picks.some((p) => p.oiPctl !== null);
  return [...picks].sort((a, b) => {
    // Open interest first when available: it is the only lens measured above
    // 1.0x random at containing the names that actually move (1.89x vs the
    // convergence count's 0.93x). Score becomes the gate, not the ordering.
    if (haveOi) {
      const d = (b.oiPctl ?? -1) - (a.oiPctl ?? -1);
      if (d !== 0) return d;
    }
    return (
      b.score - a.score ||
      b.liquidityPctl - a.liquidityPctl ||
      a.base.localeCompare(b.base)
    );
  });
}

/** Assigns |OI change| percentiles across the qualifying set, in place. */
export function assignOiPercentiles(
  picks: ConvergencePick[],
  oiChange: Map<string, number>,
): void {
  for (const p of picks) p.oiChangePct = oiChange.get(p.symbol) ?? null;

  const withOi = picks.filter((p) => p.oiChangePct !== null);
  if (withOi.length < 2) return;

  const sorted = [...withOi].sort(
    (a, b) => Math.abs(a.oiChangePct as number) - Math.abs(b.oiChangePct as number),
  );
  sorted.forEach((p, i) => {
    p.oiPctl = Math.round((100 * i) / (sorted.length - 1));
  });
}

/** Pearson correlation of two equal-length return series. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 10) return 0;
  const xs = a.slice(-n);
  const ys = b.slice(-n);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const p = xs[i] - mx;
    const q = ys[i] - my;
    num += p * q;
    dx += p * p;
    dy += q * q;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/** Bar-to-bar log returns, for the correlation estimate. */
export function returnsOf(bars: PerpBar[], count: number): number[] {
  const tail = bars.slice(-(count + 1));
  const out: number[] = [];
  for (let i = 1; i < tail.length; i++) {
    const a = tail[i - 1].c;
    const b = tail[i].c;
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

/**
 * Greedily drops names too correlated with one already chosen.
 *
 * Order is preserved, so the higher-ranked name of a correlated pair survives.
 * This runs BEFORE the category allocation: allocation decides the mix across
 * categories, de-duplication decides that the names inside each category are
 * actually different bets.
 */
export function decorrelate(
  ranked: ConvergencePick[],
  returns: Map<string, number[]>,
  maxCorr: number,
): { kept: ConvergencePick[]; dropped: number } {
  const kept: ConvergencePick[] = [];
  let dropped = 0;

  for (const p of ranked) {
    const rp = returns.get(p.symbol);
    if (!rp) {
      kept.push(p);
      continue;
    }
    const tooClose = kept.some((q) => {
      const rq = returns.get(q.symbol);
      if (!rq) return false;
      return Math.abs(correlation(rp, rq)) > maxCorr;
    });
    if (tooClose) dropped++;
    else kept.push(p);
  }
  return { kept, dropped };
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
  /** Symbols reported within the cooldown window; suppressed from the message,
   *  still recorded as candidates. The caller owns the DB lookup. */
  recentlyReported: Set<string> = new Set(),
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
  /** Trailing returns per symbol, kept for the correlation de-duplication. */
  const returnsBySymbol = new Map<string, number[]>();

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
      returnsBySymbol.set(chosen.symbol, returnsOf(bars, cfg.correlationBars));
    }
  }

  assignLiquidityPercentiles(candidates);

  // Open interest drives the ordering, so it is fetched for the qualifying set
  // rather than the whole universe — one request per name, ~100 rather than
  // ~680. A failure here degrades the ranking back to convergence order instead
  // of failing the run.
  try {
    const oiChange = await fetchOiChangeForAll(candidates.map((p) => p.symbol));
    assignOiPercentiles(candidates, oiChange);
  } catch (err) {
    logger.warn("convergence-screen", "OI fetch failed; ranking falls back to score", {
      error: err,
    });
  }

  const ranked = rankPicks(candidates);

  // Reporting filters, in order. Each one removes names from the MESSAGE only —
  // `candidates` keeps every qualifier, so the record stays complete.
  //   1. contested — both sides tied, so the signal contradicts itself
  //   2. cooldown  — reported within the last few days, so it is not new to you
  //   3. decorrelate — too similar to a name already on the list
  //   4. allocate  — proportional across categories
  const eligible = ranked.filter((p) => !p.contested && !recentlyReported.has(p.symbol));
  const cooldownSkipped = ranked.filter(
    (p) => !p.contested && recentlyReported.has(p.symbol),
  ).length;

  const longPool = decorrelate(
    eligible.filter((p) => p.side === "long"),
    returnsBySymbol,
    cfg.maxCorrelation,
  );
  const shortPool = decorrelate(
    eligible.filter((p) => p.side === "short"),
    returnsBySymbol,
    cfg.maxCorrelation,
  );

  const longs = allocateByCategory(longPool.kept, cfg.topN);
  const shorts = allocateByCategory(shortPool.kept, cfg.topN);
  const correlationSkipped = longPool.dropped + shortPool.dropped;

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
      cooldownSkipped,
      correlationSkipped,
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
