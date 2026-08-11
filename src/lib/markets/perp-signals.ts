/**
 * Signal registry for the perp research pipeline.
 *
 * WHAT THIS IS FOR
 * ----------------
 * `src/lib/markets/signals.ts` did this for equities: a signal is a pure
 * function over a price window, its name goes in a list, and the study script
 * prints its information coefficient without further edits. That pattern is why
 * testing an equity idea costs ten lines. The perp side had no equivalent — the
 * only perp backtest hard-wires `computeMcdSeries` into a 577-line script, so
 * trying one new indicator meant editing five places and trying twenty was not
 * practical. This file is the missing registry.
 *
 * SERIES, NOT POINT-IN-TIME
 * -------------------------
 * `compute` returns a value for EVERY bar in one pass, exactly as
 * `computeMcdSeries` does and for the same reason: the panel replays thousands
 * of bars per symbol across ~680 symbols, and a point-in-time call per bar would
 * be O(n^2). The contract that makes this safe is CAUSALITY — `out[i]` may read
 * `bars[0..i]` and nothing later — which is asserted for every registered signal
 * in `src/__tests__/markets/perp-signals.test.ts` by recomputing on a truncated
 * prefix and requiring an identical value. A signal that peeks fails the suite
 * rather than quietly producing alpha that cannot be traded.
 *
 * POLARITY IS PART OF THE TYPE
 * ----------------------------
 * A signal is either DIRECTIONAL (high means expect up, so the short side reads
 * its negation) or MAGNITUDE (high means expect a big move, sign unknown). The
 * distinction is not decoration: the live report already says out loud that its
 * ordering "finds movement, not direction", because it ranks on |OI change|.
 * Scoring a magnitude signal with a signed objective, or sign-flipping it for a
 * short book, measures nothing. The evaluator refuses both, and it can only do
 * that because polarity is declared here.
 *
 * TIERS EXIST BECAUSE OF THE TRADFI BOOK
 * --------------------------------------
 * Signals declare `minBars`, and the panel drops rows below it. Measured across
 * the cached universe, requiring 552 bars (MCD's 300-bar warmup plus a 252-bar
 * percentile window) erases the premarket category outright and cuts equity from
 * 90 usable names to 26 — the search would silently become crypto-only while the
 * screen it is meant to improve is not. So the percentile-ranked signals appear
 * in a CORE tier at a 120-bar window, where every category survives, and their
 * 252-bar originals live in a DEEP tier studied separately. The rank correlation
 * between the two is reported, so the substitution is judged rather than assumed.
 */
import {
  smmaSeries,
  emaSeries,
  smaSeries,
  rsiSeries,
  atrSeries,
  highestSeries,
  lowestSeries,
  percentRankSeries,
  computeMcdSeries,
  MCD_CONFIG,
  MCD_WARMUP,
  type McdBar,
} from "@/lib/markets/mcd";
import type { PerpBar, PerpCategory } from "@/lib/markets/perp-venues";
import type { PositioningHistory } from "@/lib/markets/perp-positioning-history";

export type SignalGroup =
  | "incumbent"
  | "structure"
  | "volume"
  | "momentum"
  | "volatility"
  | "attention";

/**
 * Whether the signal claims a direction or only that something will happen.
 *
 * `directional` — high means expect UP; the short book reads the negation.
 * `magnitude`   — high means expect a LARGE move of unknown sign. Scoreable
 *                 only by the capture objective, and usable in a combination
 *                 only as a gate, never as an addend.
 */
export type Polarity = "directional" | "magnitude";

/** Which study a signal belongs to — see the tier note in the module docstring. */
export type SignalTier = "core" | "deep";

interface BaseSpec {
  name: string;
  group: SignalGroup;
  polarity: Polarity;
  tier: SignalTier;
  /** One line: what it measures and why it might carry information. */
  description: string;
}

/** Per-symbol signal: a causal series aligned 1:1 with `bars`. */
export interface PerSymbolSpec extends BaseSpec {
  kind: "perSymbol";
  /**
   * Bars required before the value means anything. The panel emits null before
   * this index even if `compute` returned a number, so a partially converged
   * indicator cannot inflate coverage.
   */
  minBars: number;
  compute(bars: PerpBar[], ctx: SignalContext): (number | null)[];
}

/**
 * Cross-sectional signal: needs every symbol's state at one timestamp, so it
 * cannot be computed from one symbol's bars in isolation.
 *
 * `minBars` is absent by construction — the concept does not apply to a
 * function whose input is a cross-section rather than a history.
 */
export interface CrossSectionalSpec extends BaseSpec {
  kind: "crossSectional";
  computeAt(rows: { category: PerpCategory; bar: PerpBar; avgQuoteVol: number }[]): (number | null)[];
}

export type PerpSignalSpec = PerSymbolSpec | CrossSectionalSpec;

/** Everything a per-symbol signal may read beyond the bars themselves. */
export interface SignalContext {
  symbol: string;
  category: PerpCategory;
  /** Null when the positioning fetch has not run or the symbol was missing. */
  positioning: PositioningHistory | null;
}

// ── helpers ───────────────────────────────────────────────────────────────

const nullArray = (n: number) => new Array<number | null>(n).fill(null);

/** Percent change over `n` bars, causal. */
function rocSeries(closes: number[], n: number): (number | null)[] {
  const out = nullArray(closes.length);
  for (let i = n; i < closes.length; i++) {
    const a = closes[i - n];
    if (a > 0) out[i] = (100 * (closes[i] - a)) / a;
  }
  return out;
}

/** Rolling stdev of bar-to-bar log returns over `n` bars, in percent. */
function realizedVolSeries(closes: number[], n: number): (number | null)[] {
  const out = nullArray(closes.length);
  const rets = new Array<number>(closes.length).fill(NaN);
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0 && b > 0) rets[i] = Math.log(b / a);
  }
  for (let i = n; i < closes.length; i++) {
    let sum = 0;
    let cnt = 0;
    for (let j = i - n + 1; j <= i; j++) {
      if (Number.isFinite(rets[j])) {
        sum += rets[j];
        cnt++;
      }
    }
    if (cnt < n / 2) continue;
    const m = sum / cnt;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) {
      if (Number.isFinite(rets[j])) v += (rets[j] - m) ** 2;
    }
    out[i] = Math.sqrt(v / Math.max(1, cnt - 1)) * 100;
  }
  return out;
}

/** Rolling mean of a plain numeric array, null before the window fills. */
function rollMean(src: number[], n: number): (number | null)[] {
  return smaSeries(src, n);
}

/**
 * Volume-weighted average price anchored to the start of the calendar quarter,
 * as a SERIES.
 *
 * `convergence-screen.ts`'s `quarterlyVwap` rescans every bar on each call, so
 * evaluating it per bar would be O(n^2) — roughly 4.5M scans per symbol across
 * 680 symbols. This is the same quantity accumulated in one pass.
 *
 * Two details are load-bearing and easy to get wrong:
 *
 *  - The original derives the quarter from the LAST bar's `tClose` but filters
 *    on each bar's OPEN time `t`. A bar that opens 31 December and closes
 *    1 January therefore flips the quarter while its own open falls outside it.
 *    The reset is driven off `tClose`'s quarter and the current bar joins only
 *    when its own `t >= qStart`, which reproduces that behaviour exactly.
 *  - It weights by BASE volume `v`, not quote volume `q`, and requires 30
 *    qualifying bars — counting only bars with a finite typical price and
 *    positive volume. A different weighting is a different indicator.
 */
export function quarterlyVwapSeries(bars: PerpBar[], minBars = 30): (number | null)[] {
  const out = nullArray(bars.length);
  let qKey = -1;
  let pv = 0;
  let vol = 0;
  let n = 0;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const d = new Date(b.tClose);
    const key = d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
    if (key !== qKey) {
      qKey = key;
      pv = 0;
      vol = 0;
      n = 0;
    }

    const qStart = Date.UTC(
      Math.floor(qKey / 4),
      (qKey % 4) * 3,
      1,
    );
    if (b.t >= qStart) {
      const typical = (b.h + b.l + b.c) / 3;
      if (Number.isFinite(typical) && Number.isFinite(b.v) && b.v > 0) {
        pv += typical * b.v;
        vol += b.v;
        n++;
      }
    }

    if (n >= minBars && vol > 0) out[i] = pv / vol;
  }
  return out;
}

/**
 * The exact score the live screen ships, as a series.
 *
 * Five MCD factors at one point each plus quarterly VWAP at `vwapWeight`,
 * expressed NET (long minus short) so it is directional and comparable with
 * every other signal here. Rebuilt from one `computeMcdSeries` pass and one
 * `quarterlyVwapSeries` pass rather than by replaying `scoreSymbol`, which
 * recomputes the whole MCD series per bar and is O(n^2).
 */
export function shippedScoreSeries(bars: PerpBar[], vwapWeight = 2): (number | null)[] {
  const mcdBars: McdBar[] = bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
  const series = computeMcdSeries(mcdBars);
  const qv = quarterlyVwapSeries(bars);
  const out = nullArray(bars.length);

  for (let i = 0; i < bars.length; i++) {
    const r = series[i];
    const q = qv[i];
    const longVwap = q !== null && r.close > q ? vwapWeight : 0;
    const shortVwap = q !== null && r.close < q ? vwapWeight : 0;
    out[i] = r.longScore + longVwap - (r.shortScore + shortVwap);
  }
  return out;
}

/** Joins a sparse positioning series onto bar indices, carrying last value forward. */
function alignToBars<T extends { t: number }>(
  bars: PerpBar[],
  points: T[],
  pick: (p: T) => number,
): (number | null)[] {
  const out = nullArray(bars.length);
  if (!points.length) return out;
  let j = 0;
  let last: number | null = null;
  for (let i = 0; i < bars.length; i++) {
    // Only observations that had already SETTLED by this bar's close are
    // visible; using a point stamped after the close would be look-ahead.
    while (j < points.length && points[j].t <= bars[i].tClose) {
      const v = pick(points[j]);
      if (Number.isFinite(v)) last = v;
      j++;
    }
    out[i] = last;
  }
  return out;
}

// ── the registry ──────────────────────────────────────────────────────────

const perSymbol = (
  spec: Omit<PerSymbolSpec, "kind">,
): PerSymbolSpec => ({ kind: "perSymbol", ...spec });

export const PERP_SIGNALS: PerpSignalSpec[] = [
  // ---------------------------------------------------------------- incumbent
  perSymbol({
    name: "mcdNet",
    group: "incumbent",
    polarity: "directional",
    tier: "core",
    minBars: MCD_WARMUP,
    description: "MCD long score minus short score — the five-factor count the chart displays.",
    compute: (bars) => {
      const s = computeMcdSeries(bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })));
      return s.map((r) => r.longScore - r.shortScore);
    },
  }),
  perSymbol({
    name: "shippedScore",
    group: "incumbent",
    polarity: "directional",
    tier: "core",
    minBars: MCD_WARMUP,
    description: "The live rule: MCD factors plus quarterly VWAP at weight 2, net of the short side.",
    compute: (bars) => shippedScoreSeries(bars),
  }),
  perSymbol({
    name: "vwapSide",
    group: "incumbent",
    polarity: "directional",
    tier: "core",
    minBars: 30,
    description: "Sign of price relative to quarterly anchored VWAP — the weight-2 half of the live score.",
    compute: (bars) => {
      const qv = quarterlyVwapSeries(bars);
      return bars.map((b, i) => (qv[i] === null ? null : Math.sign(b.c - (qv[i] as number))));
    },
  }),

  // ---------------------------------------------------------------- structure
  perSymbol({
    name: "qvwapDist",
    group: "structure",
    polarity: "directional",
    tier: "core",
    minBars: 30,
    description: "Signed distance from quarterly anchored VWAP, as a fraction.",
    compute: (bars) => {
      const qv = quarterlyVwapSeries(bars);
      return bars.map((b, i) => {
        const q = qv[i];
        return q === null || q === 0 ? null : (b.c - q) / q;
      });
    },
  }),
  perSymbol({
    name: "pos50",
    group: "structure",
    polarity: "directional",
    tier: "core",
    minBars: 50,
    description: "Position within the trailing 50-bar high/low range, 0..1.",
    compute: (bars) => {
      const hi = highestSeries(bars.map((b) => b.h), 50);
      const lo = lowestSeries(bars.map((b) => b.l), 50);
      return bars.map((b, i) => {
        const h = hi[i];
        const l = lo[i];
        return h === null || l === null || h <= l ? null : (b.c - l) / (h - l);
      });
    },
  }),
  perSymbol({
    name: "distSmma200",
    group: "structure",
    polarity: "directional",
    tier: "core",
    minBars: MCD_WARMUP,
    description: "(close - SMMA200) / SMMA200 — uncapped trend extension.",
    compute: (bars) => {
      const ma = smmaSeries(bars.map((b) => b.c), MCD_CONFIG.smma3);
      return bars.map((b, i) => {
        const m = ma[i];
        return m === null || m === 0 ? null : (b.c - m) / m;
      });
    },
  }),
  perSymbol({
    name: "maStack",
    group: "structure",
    polarity: "directional",
    tier: "core",
    minBars: MCD_WARMUP,
    description: "Weakest rung of the SMMA ladder — how well ordered the stack is, not how extended.",
    compute: (bars) => {
      const closes = bars.map((b) => b.c);
      const a = smmaSeries(closes, MCD_CONFIG.smma1);
      const b2 = smmaSeries(closes, MCD_CONFIG.smma2);
      const c = smmaSeries(closes, MCD_CONFIG.smma3);
      return closes.map((px, i) => {
        const x = a[i];
        const y = b2[i];
        const z = c[i];
        if (x === null || y === null || z === null) return null;
        if (px <= 0 || x <= 0 || y <= 0 || z <= 0) return null;
        // THE MIN, NOT THE SUM. Summing the ladder's log ratios telescopes:
        //   log(px/x) + log(x/y) + log(y/z) === log(px/z)
        // which is a monotone transform of `distSmma200` and therefore the
        // IDENTICAL signal after the cross-sectional rank transform. The first
        // run of this study printed the two with the same value in every
        // column, which is what surfaced it. (`signals.ts:125` has the same
        // property for equities and is worth revisiting.)
        //
        // The weakest rung asks a genuinely different question: is the ladder
        // ORDERED, rather than how far price has travelled from its base.
        return Math.min(Math.log(px / x), Math.log(x / y), Math.log(y / z));
      });
    },
  }),

  // ------------------------------------------------------------------- volume
  perSymbol({
    name: "rvol",
    group: "volume",
    polarity: "magnitude",
    tier: "core",
    minBars: 20,
    description: "Traded value this bar over its own 20-bar average — is anyone here today.",
    compute: (bars) => {
      const q = bars.map((b) => b.q);
      const avg = rollMean(q, 20);
      return q.map((v, i) => {
        const a = avg[i];
        return a === null || a <= 0 ? null : v / a;
      });
    },
  }),
  perSymbol({
    name: "rvolZ",
    group: "volume",
    polarity: "magnitude",
    tier: "core",
    minBars: 100,
    description: "Z-score of log traded value against its own trailing 100 bars.",
    compute: (bars) => {
      const lq = bars.map((b) => (b.q > 0 ? Math.log(b.q) : NaN));
      const out = nullArray(bars.length);
      for (let i = 100; i < bars.length; i++) {
        let sum = 0;
        let cnt = 0;
        for (let j = i - 100; j < i; j++) {
          if (Number.isFinite(lq[j])) {
            sum += lq[j];
            cnt++;
          }
        }
        if (cnt < 50 || !Number.isFinite(lq[i])) continue;
        const m = sum / cnt;
        let v = 0;
        for (let j = i - 100; j < i; j++) if (Number.isFinite(lq[j])) v += (lq[j] - m) ** 2;
        const sd = Math.sqrt(v / Math.max(1, cnt - 1));
        if (sd > 0) out[i] = (lq[i] - m) / sd;
      }
      return out;
    },
  }),
  perSymbol({
    name: "volSurge",
    group: "volume",
    polarity: "magnitude",
    tier: "core",
    minBars: 20,
    description: "3-bar mean traded value over the 20-bar mean — a building, not a spike.",
    compute: (bars) => {
      const q = bars.map((b) => b.q);
      const fast = rollMean(q, 3);
      const slow = rollMean(q, 20);
      return q.map((_, i) => {
        const f = fast[i];
        const s = slow[i];
        return f === null || s === null || s <= 0 ? null : f / s;
      });
    },
  }),
  perSymbol({
    name: "obvSlope",
    group: "volume",
    polarity: "directional",
    tier: "core",
    minBars: 40,
    description: "20-bar change in on-balance volume, scaled by average volume.",
    compute: (bars) => {
      const obv = new Array<number>(bars.length).fill(0);
      for (let i = 1; i < bars.length; i++) {
        const dir = Math.sign(bars[i].c - bars[i - 1].c);
        obv[i] = obv[i - 1] + dir * bars[i].v;
      }
      const avg = rollMean(bars.map((b) => b.v), 20);
      const out = nullArray(bars.length);
      for (let i = 20; i < bars.length; i++) {
        const a = avg[i];
        if (a === null || a <= 0) continue;
        out[i] = (obv[i] - obv[i - 20]) / (a * 20);
      }
      return out;
    },
  }),
  perSymbol({
    name: "upDownVol",
    group: "volume",
    polarity: "directional",
    tier: "core",
    minBars: 20,
    description: "Share of 20-bar volume printed on up bars minus down bars, -1..1.",
    compute: (bars) => {
      const out = nullArray(bars.length);
      for (let i = 20; i < bars.length; i++) {
        let up = 0;
        let down = 0;
        for (let j = i - 19; j <= i; j++) {
          if (bars[j].c > bars[j].o) up += bars[j].v;
          else if (bars[j].c < bars[j].o) down += bars[j].v;
        }
        const tot = up + down;
        if (tot > 0) out[i] = (up - down) / tot;
      }
      return out;
    },
  }),

  // ----------------------------------------------------------------- momentum
  perSymbol({
    name: "roc6",
    group: "momentum",
    polarity: "directional",
    tier: "core",
    minBars: 6,
    description: "Return over 6 bars (1 day).",
    compute: (bars) => rocSeries(bars.map((b) => b.c), 6),
  }),
  perSymbol({
    name: "roc18",
    group: "momentum",
    polarity: "directional",
    tier: "core",
    minBars: 18,
    description: "Return over 18 bars (3 days).",
    compute: (bars) => rocSeries(bars.map((b) => b.c), 18),
  }),
  perSymbol({
    name: "roc42",
    group: "momentum",
    polarity: "directional",
    tier: "core",
    minBars: 42,
    description: "Return over 42 bars (7 days).",
    compute: (bars) => rocSeries(bars.map((b) => b.c), 42),
  }),
  perSymbol({
    name: "momVolAdj",
    group: "momentum",
    polarity: "directional",
    tier: "core",
    minBars: 60,
    description: "7-day return per unit of realized volatility — momentum on a risk scale.",
    compute: (bars) => {
      const closes = bars.map((b) => b.c);
      const r = rocSeries(closes, 42);
      const v = realizedVolSeries(closes, 42);
      return closes.map((_, i) => {
        const a = r[i];
        const b2 = v[i];
        return a === null || b2 === null || b2 <= 0 ? null : a / b2;
      });
    },
  }),
  perSymbol({
    name: "momAccel",
    group: "momentum",
    polarity: "directional",
    tier: "core",
    minBars: 40,
    description: "Change in 3-day momentum over the last 3 days — is the speed itself rising.",
    compute: (bars) => {
      const r = rocSeries(bars.map((b) => b.c), 18);
      const out = nullArray(bars.length);
      for (let i = 36; i < bars.length; i++) {
        const a = r[i];
        const b2 = r[i - 18];
        if (a !== null && b2 !== null) out[i] = a - b2;
      }
      return out;
    },
  }),
  perSymbol({
    name: "rsiRaw",
    group: "momentum",
    polarity: "directional",
    tier: "core",
    minBars: 30,
    description: "RSI-14 level — the momentum reading the live report already prints.",
    compute: (bars) => rsiSeries(bars.map((b) => b.c), MCD_CONFIG.rsiLen),
  }),
  perSymbol({
    name: "rsiSlope",
    group: "momentum",
    polarity: "directional",
    tier: "core",
    minBars: 30,
    description: "6-bar change in RSI — speed of the momentum reading rather than its level.",
    compute: (bars) => {
      const r = rsiSeries(bars.map((b) => b.c), MCD_CONFIG.rsiLen);
      const out = nullArray(bars.length);
      for (let i = 6; i < bars.length; i++) {
        const a = r[i];
        const b2 = r[i - 6];
        if (a !== null && b2 !== null) out[i] = a - b2;
      }
      return out;
    },
  }),
  perSymbol({
    name: "rev6",
    group: "momentum",
    polarity: "directional",
    tier: "core",
    minBars: 6,
    description: "Negated 1-day return — short-horizon reversal, the direct challenge to the screen's premise.",
    compute: (bars) => rocSeries(bars.map((b) => b.c), 6).map((v) => (v === null ? null : -v)),
  }),
  perSymbol({
    name: "rev6VolAdj",
    group: "momentum",
    polarity: "directional",
    tier: "core",
    minBars: 60,
    description: "Reversal scaled by realized volatility — a big drop in a quiet name counts for more.",
    compute: (bars) => {
      const closes = bars.map((b) => b.c);
      const r = rocSeries(closes, 6);
      const v = realizedVolSeries(closes, 42);
      return closes.map((_, i) => {
        const a = r[i];
        const b2 = v[i];
        return a === null || b2 === null || b2 <= 0 ? null : -a / b2;
      });
    },
  }),

  // --------------------------------------------------------------- volatility
  perSymbol({
    name: "atrPct",
    group: "volatility",
    polarity: "magnitude",
    tier: "core",
    minBars: 30,
    description: "ATR-14 as a share of price — raw volatility, comparable across names.",
    compute: (bars) => {
      const atr = atrSeries(bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), MCD_CONFIG.atrLen);
      return bars.map((b, i) => {
        const a = atr[i];
        return a === null || b.c <= 0 ? null : (a / b.c) * 100;
      });
    },
  }),
  perSymbol({
    name: "rangeExpansion",
    group: "volatility",
    polarity: "magnitude",
    tier: "core",
    minBars: 30,
    description: "This bar's true range over ATR-14 — is the range opening up right now.",
    compute: (bars) => {
      const mcd = bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
      const atr = atrSeries(mcd, MCD_CONFIG.atrLen);
      const out = nullArray(bars.length);
      for (let i = 1; i < bars.length; i++) {
        const a = atr[i];
        if (a === null || a <= 0) continue;
        const tr = Math.max(
          bars[i].h - bars[i].l,
          Math.abs(bars[i].h - bars[i - 1].c),
          Math.abs(bars[i].l - bars[i - 1].c),
        );
        out[i] = tr / a;
      }
      return out;
    },
  }),
  perSymbol({
    name: "volOfVol",
    group: "volatility",
    polarity: "magnitude",
    tier: "core",
    minBars: 120,
    description: "Stdev of the 20-bar realized-vol series over 60 bars — is volatility itself unstable.",
    compute: (bars) => {
      const rv = realizedVolSeries(bars.map((b) => b.c), 20);
      const out = nullArray(bars.length);
      for (let i = 80; i < bars.length; i++) {
        const w: number[] = [];
        for (let j = i - 59; j <= i; j++) {
          const v = rv[j];
          if (v !== null) w.push(v);
        }
        if (w.length < 30) continue;
        const m = w.reduce((a, b) => a + b, 0) / w.length;
        out[i] = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1));
      }
      return out;
    },
  }),
  perSymbol({
    name: "bbWidthPctl120",
    group: "volatility",
    polarity: "magnitude",
    tier: "core",
    minBars: 150,
    description: "Bollinger width ranked against its own 120 bars — low is the squeeze. Core-tier window.",
    compute: (bars) => {
      const closes = bars.map((b) => b.c);
      const ma = smaSeries(closes, 20);
      const width = nullArray(closes.length);
      for (let i = 19; i < closes.length; i++) {
        const m = ma[i];
        if (m === null || m <= 0) continue;
        let v = 0;
        for (let j = i - 19; j <= i; j++) v += (closes[j] - m) ** 2;
        width[i] = (2 * Math.sqrt(v / 20) * 2) / m;
      }
      return percentRankSeries(width, 120);
    },
  }),
  perSymbol({
    name: "volPctl120",
    group: "volatility",
    polarity: "magnitude",
    tier: "core",
    minBars: 150,
    description: "Self-volatility percentile over 120 bars — the live report's 'coiled/moving' reading, core window.",
    compute: (bars) => {
      const mcd = bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
      const atr = atrSeries(mcd, MCD_CONFIG.atrLen);
      const raw = atr.map((a, i) => (a === null || !bars[i].c ? null : (a / bars[i].c) * 100));
      const sm = smaSeries(raw.map((v) => v ?? 0), MCD_CONFIG.volSmaLen).map((v, i) =>
        raw[i] === null ? null : v,
      );
      return percentRankSeries(sm, 120);
    },
  }),
  // --- deep tier: the 252-bar originals, for comparison against the 120s ---
  perSymbol({
    name: "volPctl252",
    group: "volatility",
    polarity: "magnitude",
    tier: "deep",
    minBars: MCD_WARMUP + MCD_CONFIG.volPctlLen,
    description: "The live report's exact 252-bar self-volatility percentile. Deep tier — excludes most tradfi.",
    compute: (bars) => {
      const s = computeMcdSeries(bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })));
      return s.map((r) => r.volPctl);
    },
  }),
  perSymbol({
    name: "pos252",
    group: "structure",
    polarity: "directional",
    tier: "deep",
    minBars: 252,
    description: "Position within the trailing 252-bar range, 0..1. Deep tier.",
    compute: (bars) => {
      const hi = highestSeries(bars.map((b) => b.h), 252);
      const lo = lowestSeries(bars.map((b) => b.l), 252);
      return bars.map((b, i) => {
        const h = hi[i];
        const l = lo[i];
        return h === null || l === null || h <= l ? null : (b.c - l) / (h - l);
      });
    },
  }),

  // ---------------------------------------------------------------- attention
  perSymbol({
    name: "fundingPctl",
    group: "attention",
    polarity: "directional",
    tier: "core",
    minBars: 60,
    description:
      "Latest funding ranked against the symbol's own trailing history. Crowded longs pay; negated so high = expect up.",
    compute: (bars, ctx) => {
      const p = ctx.positioning;
      if (!p || !p.funding.length) return nullArray(bars.length);
      const aligned = alignToBars(bars, p.funding, (x) => x.rate);
      // Ranked against its own past, because absolute funding is not comparable
      // across names — tradfi perps run several times crypto funding.
      const ranked = percentRankSeries(aligned, 120);
      // Negated: paying to hold a long is a crowding cost, so a high funding
      // percentile is a headwind for the long side, not a tailwind.
      return ranked.map((v) => (v === null ? null : -v));
    },
  }),
  perSymbol({
    name: "fundingAbs",
    group: "attention",
    polarity: "magnitude",
    tier: "core",
    minBars: 60,
    description: "Absolute funding rate — crowding regardless of which side is paying.",
    compute: (bars, ctx) => {
      const p = ctx.positioning;
      if (!p || !p.funding.length) return nullArray(bars.length);
      return alignToBars(bars, p.funding, (x) => Math.abs(x.rate));
    },
  }),
  perSymbol({
    name: "oiChange42",
    group: "attention",
    polarity: "directional",
    tier: "core",
    minBars: 42,
    description: "Signed 7-day change in open interest. COVERAGE ~30 DAYS — venue limit.",
    compute: (bars, ctx) => {
      const p = ctx.positioning;
      if (!p || !p.oi.length) return nullArray(bars.length);
      const oi = alignToBars(bars, p.oi, (x) => x.oi);
      const out = nullArray(bars.length);
      for (let i = 42; i < bars.length; i++) {
        const a = oi[i];
        const b2 = oi[i - 42];
        if (a !== null && b2 !== null && b2 > 0) out[i] = (100 * (a - b2)) / b2;
      }
      return out;
    },
  }),
  perSymbol({
    name: "oiChangeAbs",
    group: "attention",
    polarity: "magnitude",
    tier: "core",
    minBars: 42,
    description:
      "Absolute 7-day open-interest change — THE METRIC THE LIVE REPORT RANKS ON. COVERAGE ~30 DAYS.",
    compute: (bars, ctx) => {
      const p = ctx.positioning;
      if (!p || !p.oi.length) return nullArray(bars.length);
      const oi = alignToBars(bars, p.oi, (x) => x.oi);
      const out = nullArray(bars.length);
      for (let i = 42; i < bars.length; i++) {
        const a = oi[i];
        const b2 = oi[i - 42];
        if (a !== null && b2 !== null && b2 > 0) out[i] = Math.abs((100 * (a - b2)) / b2);
      }
      return out;
    },
  }),
  perSymbol({
    name: "takerSkew",
    group: "attention",
    polarity: "directional",
    tier: "core",
    minBars: 42,
    description: "Taker buy/sell ratio versus its own 20-bar mean — who is crossing the spread. ~30 DAYS.",
    compute: (bars, ctx) => {
      const p = ctx.positioning;
      if (!p || !p.taker.length) return nullArray(bars.length);
      const r = alignToBars(bars, p.taker, (x) => x.ratio);
      const avg = smaSeries(r.map((v) => v ?? 0), 20).map((v, i) => (r[i] === null ? null : v));
      return r.map((v, i) => {
        const a = avg[i];
        return v === null || a === null || a <= 0 ? null : v / a - 1;
      });
    },
  }),
  perSymbol({
    name: "oiPriceDivergence",
    group: "attention",
    polarity: "directional",
    tier: "core",
    minBars: 42,
    description:
      "sign(OI change) x sign(price change) — the four-quadrant regime as a number. LOW CARDINALITY, ~30 DAYS.",
    compute: (bars, ctx) => {
      const p = ctx.positioning;
      if (!p || !p.oi.length) return nullArray(bars.length);
      // Computed from bars inside this signal rather than read from `roc42`:
      // the registry has no inter-signal dependency mechanism and adding one
      // for a single consumer would be a worse trade than recomputing a cheap
      // series.
      const roc = rocSeries(bars.map((b) => b.c), 42);
      const oi = alignToBars(bars, p.oi, (x) => x.oi);
      const out = nullArray(bars.length);
      for (let i = 42; i < bars.length; i++) {
        const a = oi[i];
        const b2 = oi[i - 42];
        const r = roc[i];
        if (a === null || b2 === null || b2 <= 0 || r === null) continue;
        out[i] = Math.sign(a - b2) * Math.sign(r);
      }
      return out;
    },
  }),

  // ------------------------------------------------- cross-sectional (volume)
  {
    kind: "crossSectional",
    name: "dollarVolPctl",
    group: "volume",
    polarity: "magnitude",
    tier: "core",
    description:
      "Percentile of 30-bar average traded value WITHIN the name's category — the live screen's tie-break.",
    computeAt: (rows) => {
      const out = new Array<number | null>(rows.length).fill(null);
      const byCat = new Map<string, number[]>();
      rows.forEach((r, i) => {
        const g = byCat.get(r.category);
        if (g) g.push(i);
        else byCat.set(r.category, [i]);
      });
      for (const idxs of Array.from(byCat.values())) {
        if (idxs.length === 1) {
          // A sole member of its category is at its own top by definition;
          // scoring it 0 would bury the only commodity name in every ranking.
          out[idxs[0]] = 100;
          continue;
        }
        const sorted = [...idxs].sort((a, b) => rows[a].avgQuoteVol - rows[b].avgQuoteVol);
        sorted.forEach((idx, rank) => {
          out[idx] = (100 * rank) / (sorted.length - 1);
        });
      }
      return out;
    },
  },
];

export const SIGNAL_BY_NAME = new Map(PERP_SIGNALS.map((s) => [s.name, s]));

export const CORE_SIGNALS = PERP_SIGNALS.filter((s) => s.tier === "core");
export const DEEP_SIGNALS = PERP_SIGNALS.filter((s) => s.tier === "deep");

/** Signals whose coverage is capped at ~30 days by the venue, not by history. */
export const SHALLOW_COVERAGE = new Set([
  "oiChange42",
  "oiChangeAbs",
  "takerSkew",
  "oiPriceDivergence",
]);

/**
 * Stable hash of a registry selection plus config, for cache invalidation.
 *
 * Any change to the signal list, the horizon or the panel semantics must
 * produce a different panel file, or a stale cache silently answers a question
 * about a registry that no longer exists.
 */
export function registryHash(names: string[], cfg: Record<string, unknown>): string {
  const payload = JSON.stringify({ names: [...names].sort(), cfg });
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
