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
import { fetchOiChangeForAll, fetchFundingSnapshot } from "@/lib/markets/perp-positioning";
import { summarizeRegime, type RegimeInput, type RegimeSummary } from "@/lib/markets/perp-regime";
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
  /** Per side, and the total budget is `2 × topN` shared across both sides. */
  topN: 8,
  /**
   * Floor and ceiling on either side of the shared `2 × topN` budget.
   *
   * [decision: flexible-side-split] `splitBudget` can lean the report toward the
   * side carrying more of the volume-and-funding action (the `comboGated` count)
   * instead of forcing a fixed 8 long / 8 short every day. The MECHANISM is
   * built and tested, but it ships EVEN (`min = max = topN`, i.e. 8/8) on
   * purpose:
   *
   * The 2026-08 holdout review flagged the fixed quota because the short book
   * returned −13% at 7d over a 16-day alt rally. But when the picks were finally
   * labelled (this is what created `pick_labels` source='perp'), the gated-share
   * lean was measured against those same labels and it leaned SHORT 40/5 on
   * 16-17 Aug — the very days that were then squeezed hardest. A squeeze is a
   * reversal of the trailing signal, so every trailing-signal split (breadth or
   * regime alike) leans INTO it. No such split beat an even 8/8 on the one
   * regime there is data for, so shipping a lean now would be fitting to noise.
   *
   * The knobs stay so a lean can be switched on the day a multi-regime study
   * picks a weight that holds out of sample: widen to e.g. `minPerSide: 3,
   * maxPerSide: 11`. Until then, even.
   */
  minPerSide: 8,
  maxPerSide: 8,
  /**
   * A short candidate whose trailing move is above this is dropped from the
   * MESSAGE (still recorded).
   *
   * [decision: trend-short-gate] The same review found the short book was
   * shorting names that had just risen and getting squeezed on the continuation:
   * conditioned on the stored regime, every short bucket was negative and the
   * worst were the ones entered after strength. `changePct` is the move over
   * `liquidityBars`; requiring it to be non-positive keeps shorts to names
   * actually rolling over, not to strength that merely triggered enough factors.
   * A gate on the message only — the control group keeps every qualifier.
   */
  trendShortMaxChangePct: 0,
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
   * Share of the qualifying set kept by the magnitude gate.
   *
   * The composite ranker validated in `docs/perp-signal-research.md` is
   * `rvol + rev6 + fundingAbs`: gate to the busiest, most funding-stressed
   * names, then order those by short-horizon reversal. 0.30 is the gate width
   * the study fixed A PRIORI and never searched — varying it after seeing
   * results would be an unaccounted extra dimension, so it is not a tunable
   * here either.
   */
  magnitudeGateQ: 0.3,
  /** Bars for the reversal leg of the composite: 6 bars = 1 day. */
  reversalBars: 6,
  /** Bars for the relative-volume leg. */
  rvolBars: 20,
  /** Fast window for the volume-surge leg: 3 bars against the 20-bar mean. */
  rvolFastBars: 3,
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
  /**
   * Relative volume: this bar's traded value over its own 20-bar average.
   *
   * Magnitude leg of the composite. High means the name is actually being
   * traded right now, which is what separates a reversal worth looking at from
   * a print in an empty book.
   */
  rvol: number | null;
  /** 3-bar mean traded value over the 20-bar mean — building interest. */
  volSurge: number | null;
  /** This bar's true range over ATR-14 — is the range opening up now. */
  rangeExpansion: number | null;
  /**
   * Negated 1-day return. High means the name just FELL hardest.
   *
   * The directional leg, and the finding that most contradicts the screen's
   * original premise: over 500 days of 4h bars, ranking perps by recent
   * weakness beat ranking them by indicator convergence by a wide margin, and
   * the convergence count's own information coefficient is negative.
   */
  rev6: number | null;
  /** |latest funding rate|, as a fraction. Magnitude leg — crowding either way. */
  fundingAbs: number | null;
  /**
   * The composite ranking score: cross-sectional rank-z of `rev6`, signed for
   * this pick's side. Null when the inputs were unavailable.
   */
  comboScore: number | null;
  /** Whether this name cleared the magnitude gate (top `magnitudeGateQ`). */
  comboGated: boolean;
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
    /** Short qualifiers dropped by the trend gate — up over the trailing window,
     *  so squeeze-prone rather than rolling over. Recorded, not sent. */
    trendShortSkipped: number;
    byCategory: Record<string, number>;
  };
  /** Bar close time the scores were computed from, ISO. */
  asOf: string;
  /**
   * What the tape is doing, over the LIQUID universe rather than the picks.
   *
   * Computed here because this is the only place the bars for the whole
   * universe exist in memory. The sender cannot recompute it: that job runs in
   * CI, and the venue answers HTTP 451 to datacenter ranges, which is the same
   * constraint that split the two jobs in the first place. So it is measured
   * here, stored by the pipeline, and read back at send time.
   */
  regime: RegimeSummary | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Bases that cannot produce a trade, however good the score looks.
 *
 * The retired crypto screen filtered these and the consolidation dropped the
 * filter, which let USDC reach a reported LONG slot: a dollar stablecoin sits
 * pinned near its peg, so it is permanently "coiled" and permanently near any
 * VWAP — exactly the profile the score rewards. The screen was working as
 * written and the output was still nonsense.
 *
 * Non-USD pegs are included for the same reason: on a dollar slide EURC prints
 * a clean trend that is a currency move, not an opportunity in the asset.
 */
const NON_TRADABLE_BASES = new Set([
  "USDC", "USDT", "DAI", "USDE", "USDS", "FDUSD", "TUSD", "USD1", "PYUSD",
  "BUSD", "USDD", "GUSD", "FRAX", "LUSD", "USDP", "CRVUSD", "RLUSD", "USDG",
  "USDX", "EURC", "EURS", "EURT", "EURI",
]);

/** True when the base is a peg rather than a position. */
export const isNonTradable = (base: string): boolean => NON_TRADABLE_BASES.has(base);

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

  // ---- composite legs ----
  // Computed here so they travel with the pick; the cross-sectional ranking
  // that turns them into a score needs the whole candidate set and happens in
  // `assignComboScores`.
  const last = bars[bars.length - 1];
  const rvolWindow = bars.slice(-cfg.rvolBars).map((b) => b.q).filter(Number.isFinite);
  const rvolAvg = mean(rvolWindow);
  const rvol = rvolAvg > 0 && Number.isFinite(last.q) ? last.q / rvolAvg : null;

  // Building interest rather than a single loud bar: a 3-bar mean against the
  // 20-bar mean fires on a tape that has been busy for half a day, where `rvol`
  // fires on one print.
  const fastWindow = bars.slice(-cfg.rvolFastBars).map((b) => b.q).filter(Number.isFinite);
  const fastAvg = mean(fastWindow);
  const volSurge = rvolAvg > 0 && fastAvg > 0 ? fastAvg / rvolAvg : null;

  // Range opening up right now, measured against the name's own ATR so it is
  // comparable across a $65,000 name and a $0.02 one.
  const prevClose = bars[bars.length - 2]?.c;
  const trueRange =
    prevClose === undefined
      ? last.h - last.l
      : Math.max(last.h - last.l, Math.abs(last.h - prevClose), Math.abs(last.l - prevClose));
  const rangeExpansion = r.atr && r.atr > 0 ? trueRange / r.atr : null;

  const prior = bars[bars.length - 1 - cfg.reversalBars]?.c;
  const rev6 = prior && prior > 0 ? -(100 * (r.close - prior)) / prior : null;

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
    // Legs travel with the pick; the score they feed is cross-sectional.
    rvol,
    volSurge,
    rangeExpansion,
    rev6,
    fundingAbs: null,
    comboScore: null,
    comboGated: false,
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
 * Cross-sectional rank z-score, on ranks rather than raw values.
 *
 * Ties share an average rank; the result spans roughly [-1, 1]. Ranks and not
 * raw values because every leg here is return- or volume-derived and therefore
 * fat-tailed: one name up 400% would otherwise dominate the composite by
 * itself. Same construction as `signals.ts:rankZ`, kept local so the screen
 * does not depend on the research harness.
 */
function rankZ(values: (number | null)[]): (number | null)[] {
  const present: { v: number; i: number }[] = [];
  values.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) present.push({ v, i });
  });
  const out = new Array<number | null>(values.length).fill(null);
  const n = present.length;
  if (n < 3) return out;

  present.sort((a, b) => a.v - b.v);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && present[j + 1].v === present[i].v) j++;
    const avgRank = (i + j) / 2;
    // (2r - (n-1)) / (n-1), not (r/(n-1))*2 - 1: the two differ by one ULP in
    // floating point and only this form makes the rank-z set exactly
    // antisymmetric. See the same note in `perp-evaluate.ts:rankZWithin`.
    const z = (2 * avgRank - (n - 1)) / (n - 1);
    for (let k = i; k <= j; k++) out[present[k].i] = z;
    i = j + 1;
  }
  return out;
}

/**
 * Assigns the composite score and the magnitude gate, in place.
 *
 * THE RANKING THIS SCREEN NOW USES, AND WHY IT CHANGED
 * ---------------------------------------------------
 * A systematic search over ~4,700 indicator combinations on 500 days of 4h bars
 * across 546 perps selected
 * `rvol + volSurge + rev6 + fundingAbs + rangeExpansion`, with a holdout
 * information coefficient of 0.085 (t = 6.43) against a procedure-level
 * bootstrap null of p = 0.005. The screen's own weighted convergence score
 * measured -0.027 on the same holdout rows, and |OI change| — the key this
 * replaces — could not be tested at all, because the venue serves only 30 days
 * of open-interest history (5.3% coverage of the study panel).
 *
 * THE SIZE OF THIS SET IS NOT SETTLED
 * -----------------------------------
 * Two runs of the same search chose differently: k=3 (`rvol + rev6 +
 * fundingAbs`, holdout IC 0.078) and k=5 (this set, 0.085). The inner
 * walk-forward scores that pick k were 0.0738 and 0.0739 — a gap far smaller
 * than the noise between runs, so the selection flipped on a coin toss rather
 * than on evidence. Read this as "k is somewhere in 3-5" and expect the next
 * search to move it again. The two extra indicators are both magnitude legs,
 * so they widen the gate's basis rather than change what the list is ordered
 * by; the directional claim is `rev6` alone in either version.
 *
 * The two magnitude legs GATE and the directional leg ORDERS. That split is not
 * stylistic: `rvol` and `fundingAbs` predict that a name will MOVE, not which
 * way, so rank-averaging them with a directional signal would tilt the list
 * toward big-|move| names without expressing a position. Gate first, then rank
 * the survivors by reversal.
 *
 * `rev6` is signed by side. For a long, the best candidate is the name that
 * fell hardest; for a short, the one that rose hardest. That is the reversal
 * effect stated in both directions.
 *
 * WHAT IS NOT CLAIMED
 * -------------------
 * The composite was validated as a cross-sectional ranker over the LIQUID
 * UNIVERSE, not over the convergence-qualified subset it is applied to here.
 * Ranking within a set that has already passed a score >= 5 gate is an
 * extrapolation from the measurement, and the honest next test is whether the
 * convergence gate should exist at all — the study says it carries a negative
 * IC. See `docs/perp-signal-research.md`.
 *
 * The ordering is also the ONLY thing shown to be better. The same holdout put
 * the top-10 basket's excess return at t = 0.15 — indistinguishable from noise.
 * This is a better order for a list a human reads, not a trading rule.
 */
export function assignComboScores(
  picks: ConvergencePick[],
  funding: Map<string, number>,
  cfg: ConvergenceConfig = CONVERGENCE_CONFIG,
): void {
  for (const p of picks) {
    const f = funding.get(p.symbol);
    p.fundingAbs = f === undefined ? null : Math.abs(f);
  }
  if (picks.length < 3) return;

  const zRvol = rankZ(picks.map((p) => p.rvol));
  const zSurge = rankZ(picks.map((p) => p.volSurge));
  const zFund = rankZ(picks.map((p) => p.fundingAbs));
  const zRange = rankZ(picks.map((p) => p.rangeExpansion));

  // Gate score averages whichever magnitude legs are available, so a missing
  // funding snapshot degrades the gate rather than voiding it.
  const gate = picks.map((_, i) => {
    const parts = [zRvol[i], zSurge[i], zFund[i], zRange[i]].filter(
      (v): v is number => v !== null,
    );
    return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  });

  const ordered = gate
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null)
    .sort((a, b) => b.v - a.v);
  const keep = Math.max(1, Math.round(ordered.length * cfg.magnitudeGateQ));
  const gated = new Set(ordered.slice(0, keep).map((x) => x.i));

  // Reversal is ranked WITHIN each side, because the sign flips between them
  // and a single pooled ranking would order longs and shorts against each
  // other on a quantity that means the opposite thing for each.
  for (const side of ["long", "short"] as const) {
    const idxs = picks.map((p, i) => ({ p, i })).filter((x) => x.p.side === side);
    if (idxs.length < 3) continue;
    const signed = idxs.map((x) =>
      x.p.rev6 === null ? null : side === "long" ? x.p.rev6 : -x.p.rev6,
    );
    const z = rankZ(signed);
    idxs.forEach((x, k) => {
      picks[x.i].comboScore = z[k];
    });
  }

  picks.forEach((p, i) => {
    p.comboGated = gated.has(i);
  });
}

/**
 * Ranking key.
 *
 * Gate first, then the composite score. `assignComboScores` carries the full
 * argument for why this replaced ranking on |OI change|; the short version is
 * that the composite was measured out-of-sample at IC 0.078 (t = 5.97) while
 * the OI key could not be measured at all beyond a 30-day window.
 *
 * The convergence score survives as the third key, not the first. It gates the
 * list — a name still needs 5 of 7 to be here — but among names that qualified
 * it carries a negative measured IC, so it is a poor ordering principle.
 *
 * Within-category liquidity remains the tie-break: among names the composite
 * likes equally, prefer the one most tradable RELATIVE TO ITS OWN COHORT.
 * `base` last makes the order deterministic.
 */
export function rankPicks(picks: ConvergencePick[]): ConvergencePick[] {
  const haveCombo = picks.some((p) => p.comboScore !== null);
  return [...picks].sort((a, b) => {
    if (haveCombo) {
      // Gated names outrank ungated ones outright — the gate is a filter
      // expressed as an ordering, so the list degrades gracefully when fewer
      // than topN names clear it instead of coming back short.
      if (a.comboGated !== b.comboGated) return a.comboGated ? -1 : 1;
      // Compared BEFORE subtracting. Subtracting two sentinels gives
      // -Infinity - -Infinity = NaN, and `NaN !== 0` is true, so the comparator
      // would return NaN and hand `sort` undefined behaviour for any pair that
      // both lack a score.
      const av = a.comboScore ?? Number.NEGATIVE_INFINITY;
      const bv = b.comboScore ?? Number.NEGATIVE_INFINITY;
      if (av !== bv) return bv - av;
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
 * Splits the shared `budget` between the two sides by their share of the action.
 *
 * `weight` is each side's count of gated (high volume-and-funding) qualifiers —
 * the leg the holdout review found positively related to forward return, so the
 * budget leans toward where names are actually being traded, not toward whichever
 * side merely has more names scraping the threshold. Both results are clamped to
 * [min, max] and to the supply each side actually has, then any budget a clamp
 * frees up is handed to the other side while it has room. With `min = budget/2`
 * the split is pinned to an even split, which is the pre-review behaviour.
 */
export function splitBudget(
  longWeight: number,
  shortWeight: number,
  longSupply: number,
  shortSupply: number,
  budget: number,
  min: number,
  max: number,
): { longSlots: number; shortSlots: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  // A side cannot be floored above what it can supply, or the budget would claim
  // names that do not exist and never reach the other side.
  const floorL = Math.min(min, longSupply);
  const floorS = Math.min(min, shortSupply);
  const capL = Math.min(max, longSupply);
  const capS = Math.min(max, shortSupply);
  const total = longWeight + shortWeight;
  // No signal either way — fall back to an even split.
  const rawLong = total > 0 ? Math.round((budget * longWeight) / total) : Math.round(budget / 2);

  const shortSlots = clamp(budget - clamp(rawLong, floorL, capL), floorS, capS);
  // Whatever the short cap freed is offered back to the long side, so the budget
  // fills to `budget` whenever the two sides between them have the supply.
  const longSlots = clamp(budget - shortSlots, floorL, capL);
  return { longSlots, shortSlots };
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
  /** Every liquid name, for the regime read — NOT only the qualifiers. */
  const regimeInputs: RegimeInput[] = [];
  /** Trailing returns per symbol, kept for the correlation de-duplication. */
  const returnsBySymbol = new Map<string, number[]>();

  const intervalMs = INTERVAL_MS[cfg.interval] ?? 14_400_000;
  const now = Date.now();

  for (const sym of symbols) {
    // Pegs are excluded before anything else — they cannot be an opportunity
    // regardless of how the indicators read.
    if (isNonTradable(sym.base)) continue;

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
    // Recorded here, at the liquidity gate, and not further down at the score
    // gate: the regime describes the market the shortlist is drawn FROM. Reading
    // it off the qualifiers would describe the shortlist instead, and a screen
    // whose gate favours coiled names would then report a calm tape by
    // construction, on any tape.
    regimeInputs.push({ base: sym.base, category: sym.category, bars });

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

  // The composite drives the ordering. Funding for the whole universe is one
  // request, so this is cheap; a failure degrades the gate to relative volume
  // alone rather than failing the run.
  try {
    const funding = await fetchFundingSnapshot();
    assignComboScores(candidates, funding, cfg);
  } catch (err) {
    logger.warn("convergence-screen", "Funding snapshot failed; gate uses rvol alone", {
      error: err,
    });
    assignComboScores(candidates, new Map(), cfg);
  }

  // Open interest is now ANNOTATION, not the ranking key. It is still recorded
  // because the stored rows are the only thing that will ever settle whether
  // dropping it as an ordering principle was right — and because the venue's
  // 30-day history means the only way to get a long OI series is to bank one
  // day at a time.
  try {
    const oiChange = await fetchOiChangeForAll(candidates.map((p) => p.symbol));
    assignOiPercentiles(candidates, oiChange);
  } catch (err) {
    logger.warn("convergence-screen", "OI fetch failed; picks recorded without it", {
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

  // Trend-short gate: a short must be rolling over, not merely have tripped the
  // factors while rising. Applied after decorrelation so the count reflects what
  // would actually have been sendable. See [decision: trend-short-gate].
  const shortKept = shortPool.kept.filter(
    (p) => (p.changePct ?? 0) <= cfg.trendShortMaxChangePct,
  );
  const trendShortSkipped = shortPool.kept.length - shortKept.length;

  // Share the 2×topN budget between the sides by where the gated action is,
  // rather than forcing 8/8. See [decision: flexible-side-split].
  const budget = cfg.topN * 2;
  const { longSlots, shortSlots } = splitBudget(
    longPool.kept.filter((p) => p.comboGated).length,
    shortKept.filter((p) => p.comboGated).length,
    longPool.kept.length,
    shortKept.length,
    budget,
    cfg.minPerSide,
    cfg.maxPerSide,
  );

  const longs = allocateByCategory(longPool.kept, longSlots);
  const shorts = allocateByCategory(shortKept, shortSlots);
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
      trendShortSkipped,
      byCategory,
    },
    // The bar CLOSE, not its open — the moment the scored data was complete.
    asOf: latestBarClose ? new Date(latestBarClose).toISOString() : new Date().toISOString(),
    regime: null,
  };

  // After `asOf` is known, so the read is stamped with the same moment the
  // scores are. A failure here costs the regime block and not the shortlist.
  try {
    result.regime = summarizeRegime(regimeInputs, result.asOf);
  } catch (err) {
    logger.warn("convergence-screen", "Regime read failed; picks stand without it", {
      error: err,
    });
  }

  logger.info("convergence-screen", "Screen complete", {
    venue: venueName,
    ...result.funnel,
    longs: longs.length,
    shorts: shorts.length,
    asOf: result.asOf,
  });

  return result;
}
