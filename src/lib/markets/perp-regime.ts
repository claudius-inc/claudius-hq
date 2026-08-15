/**
 * What state is the tape in, and for which book?
 *
 * WHY THIS EXISTS
 * ---------------
 * The shortlist scores every symbol in isolation. It has never known whether the
 * market it is picking from is trending or going sideways, and that omission is
 * not cosmetic: the list is ORDERED by `rev6`, a one-day reversal signal.
 * Reversal is a mean-reversion bet. It is the right ranking in a choppy tape and
 * the wrong one in a trending tape, and until now the message gave the reader no
 * way to tell which they were looking at.
 *
 * TREND IS MEASURED AGAINST A RANDOM WALK, NOT AGAINST A CONSTANT
 * --------------------------------------------------------------
 * The measure is the Kaufman efficiency ratio: net travel over gross travel
 * across a window. Its scale is not intuitive and, worse, it is horizon
 * dependent — a random walk scores about `1/sqrt(n)`, so 0.10 is unremarkable
 * over 100 bars and remarkable over 1,000. Comparing a raw ER against a fixed
 * threshold silently compares different windows to different implicit nulls.
 *
 * So every ER here is reported as a MULTIPLE of its own random-walk null. That
 * makes 1.0x mean "exactly as directional as a coin flip" at any window length,
 * and it makes "choppier than random" a statement the reader can check rather
 * than a label they have to trust.
 *
 * THE CONTEXT AXIS IS HAND-MADE, AND THAT IS A LIMIT
 * -------------------------------------------------
 * The venue gives five categories — crypto, equity, premarket, commodity, index.
 * "Semis" and "financials" do not exist in the data. `SECTOR` below is a hand
 * grouping of the tradfi book, and unlike `perp-underlying.ts` it has NOT been
 * verified against any external source, because there is nothing to verify it
 * against: it is a naming choice, not a claim about an instrument. A name that
 * is not in the map falls to `equity-other` rather than being dropped, so the
 * map being incomplete costs resolution and never costs coverage.
 */
import type { PerpBar, PerpCategory } from "@/lib/markets/perp-venues";
import { emaSeries } from "@/lib/markets/mcd";
// Deliberately NOT `convergence-screen`, which is about to import this module —
// the pair would be a cycle. `quarterlyVwapSeries` is the same quantity in one
// pass, and `perp-signals.test.ts` asserts the two agree bar for bar.
import { EMA_RIBBON, quarterlyVwapSeries } from "@/lib/markets/perp-signals";

export const REGIME_CONFIG = {
  /** 42 bars = 7 days of 4h bars. */
  shortBars: 42,
  /** 180 bars = 30 days. The window the headline regime is read over. */
  longBars: 180,
  /**
   * Smallest group that gets its own line.
   *
   * A one-name "sector" has no median worth printing, and the first version of
   * this read labelled a single financials name a DOWNTREND off a −17% move.
   * That is one stock, not a sector.
   *
   * 5 and not 8, which was the first choice: only 6 crypto majors clear the
   * liquidity floor, so a floor of 8 silently dropped BTC and ETH — the context
   * a mostly-crypto shortlist needs most — while keeping an 8-name commodity
   * bucket. Below 5 a median is one or two names talking.
   */
  minGroupN: 5,
  /**
   * ER multiple at or above which a group is called trending.
   *
   * FIXED A PRIORI, NEVER SEARCHED — the same discipline `magnitudeGateQ` is
   * held to. 1.8x is a judgement that "meaningfully more directional than a coin
   * flip" needs close to double the random-walk null; it is not fitted to any
   * outcome, and no result in this file has been optimised against it. Tuning it
   * later against forward returns would make every label a fitted quantity.
   */
  trendMultiple: 1.8,
} as const;

export type RegimeLabel = "uptrend" | "downtrend" | "crabbing";

export interface RegimeInput {
  base: string;
  category: PerpCategory;
  bars: PerpBar[];
}

export interface GroupRegime {
  group: string;
  n: number;
  /** Median 7-day return, %. */
  ret7: number;
  /** Median 30-day return, %. */
  ret30: number;
  /** Median efficiency ratio over `longBars`. */
  er30: number;
  /** `er30` as a multiple of the random-walk null for that window. */
  erMultiple: number;
  /** Share with the EMA ribbon fully stacked up / fully inverted, 0-100. */
  ribbonUpPct: number;
  ribbonDownPct: number;
  /** Share trading above quarterly anchored VWAP, 0-100. */
  aboveVwapPct: number;
  label: RegimeLabel;
}

export interface RegimeSummary {
  /** Groups with at least `minGroupN` members, largest first. */
  groups: GroupRegime[];
  /** Every liquid name pooled — the headline. */
  universe: GroupRegime;
  /** Bar close the read was computed from, ISO. */
  asOf: string;
}

/** Hand grouping of the tradfi book. See the limit in the module docstring. */
const SECTOR: Record<string, string> = {};
const put = (names: string[], sector: string) => {
  for (const n of names) SECTOR[n] = sector;
};
put(
  ["NVDA","AMD","AVGO","MU","TSM","ASML","AMAT","LRCX","KLAC","MRVL","ALAB","CRDO","TER","INTC",
   "QCOM","TXN","SNDK","WDC","SMCI","COHR","LITE","CIEN","GLW","AAOI","AXTI","FLEX","ARM","SMH"],
  "semis",
);
put(
  ["AAPL","MSFT","GOOGL","AMZN","META","NFLX","ORCL","CRM","NOW","ADBE","PLTR","SNOW","PANW",
   "CRWD","IBM","CSCO","DELL","HPE","UBER","ZM","TTWO","EBAY","APP","RDDT","DIS","SONY","BABA",
   "NOK","NBIS","CRWV"],
  "tech",
);
put(["JPM","GS","V","PYPL","BX","SOFI","HOOD","BRKB"], "financials");
put(["COIN","MSTR","IREN","GME"], "crypto-equity");
put(["KO","COST","WMT","HD","WEN","DKNG","LLY","NVO","HIMS"], "consumer");
put(["CAT","RIVN","TSLA","GEV","VRT","RKLB","ASTS","ONDS","BE","FLNC","USAR"], "industrial");
put(["SPY","QQQ","IWM","XBI","XLE","URNM","EWJ","EWT","EWY","EWZ","FWDI"], "etf");

/** The coins whose direction the rest of the crypto book mostly follows. */
const MAJORS = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE"]);

/** Which context a name is reported under. */
export function groupOf(base: string, category: PerpCategory): string {
  if (category === "equity") return SECTOR[base] ?? "equity-other";
  if (category === "crypto") return MAJORS.has(base) ? "majors" : "alts";
  return category;
}

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Net travel over gross travel across the last `n` bars, 0..1.
 *
 * 1.0 is a straight line. A random walk lands near `1/sqrt(n)`. Returns null
 * when the history is too short, rather than a number computed from fewer bars
 * than asked for — a short window has a HIGHER null, so quietly shrinking it
 * would make thin names look more trending than deep ones.
 */
export function efficiencyRatio(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const tail = closes.slice(-(n + 1));
  const net = Math.abs(tail[tail.length - 1] - tail[0]);
  let gross = 0;
  for (let i = 1; i < tail.length; i++) gross += Math.abs(tail[i] - tail[i - 1]);
  return gross > 0 ? net / gross : null;
}

/** The random-walk expectation for `efficiencyRatio` over `n` bars. */
export const randomWalkEr = (n: number): number => 1 / Math.sqrt(n);

/** Percent change over `n` bars. */
export function returnOver(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const a = closes[closes.length - 1 - n];
  return a > 0 ? (100 * (closes[closes.length - 1] - a)) / a : null;
}

/**
 * The EMA ribbon's state on the last bar: +1 stacked up, -1 inverted, 0 tangled.
 *
 * Reported as BREADTH, never as a signal. `docs/perp-signal-research.md` §3.5
 * measured this ribbon's information coefficient at −0.030 (t = −5.50) — a
 * stacked ribbon predicted UNDERperformance. It earns its place here because a
 * count of how many names are stacked describes the tape, which is a different
 * question from whether stacking predicts a return.
 */
export function ribbonState(closes: number[]): number | null {
  const lines = EMA_RIBBON.map((len) => emaSeries(closes, len));
  const i = closes.length - 1;
  const vals: number[] = [];
  for (const line of lines) {
    const v = line[i];
    if (v === null || !(v > 0)) return null;
    vals.push(v);
  }
  let up = true;
  let down = true;
  for (let k = 0; k + 1 < vals.length; k++) {
    if (!(vals[k] > vals[k + 1])) up = false;
    if (!(vals[k] < vals[k + 1])) down = false;
  }
  return up ? 1 : down ? -1 : 0;
}

/** Trend or not, and which way. */
export function classify(ret: number, erMultiple: number): RegimeLabel {
  if (!Number.isFinite(erMultiple) || erMultiple < REGIME_CONFIG.trendMultiple) return "crabbing";
  return ret >= 0 ? "uptrend" : "downtrend";
}

interface Measured {
  group: string;
  ret7: number | null;
  ret30: number | null;
  er30: number | null;
  ribbon: number | null;
  aboveVwap: boolean | null;
}

function aggregate(group: string, rows: Measured[]): GroupRegime {
  const nums = (pick: (r: Measured) => number | null) =>
    rows.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));

  const withRibbon = rows.filter((r) => r.ribbon !== null);
  const withVwap = rows.filter((r) => r.aboveVwap !== null);
  const share = (count: number, of: number) => (of === 0 ? 0 : (100 * count) / of);

  const ret30 = median(nums((r) => r.ret30));
  const er30 = median(nums((r) => r.er30));
  const erMultiple = er30 / randomWalkEr(REGIME_CONFIG.longBars);

  return {
    group,
    n: rows.length,
    ret7: median(nums((r) => r.ret7)),
    ret30,
    er30,
    erMultiple,
    ribbonUpPct: share(withRibbon.filter((r) => r.ribbon === 1).length, withRibbon.length),
    ribbonDownPct: share(withRibbon.filter((r) => r.ribbon === -1).length, withRibbon.length),
    aboveVwapPct: share(withVwap.filter((r) => r.aboveVwap === true).length, withVwap.length),
    label: classify(ret30, erMultiple),
  };
}

/**
 * The whole read, from the bars the screen already fetched.
 *
 * Takes the LIQUID universe, not the qualifying picks: the regime is a property
 * of the market being picked from, and computing it over names that already
 * passed a convergence gate would describe the shortlist rather than the tape.
 */
export function summarizeRegime(inputs: RegimeInput[], asOf: string): RegimeSummary {
  const measured: Measured[] = [];

  for (const { base, category, bars } of inputs) {
    if (bars.length < REGIME_CONFIG.longBars + 1) continue;
    const closes = bars.map((b) => b.c);
    const qv = quarterlyVwapSeries(bars)[bars.length - 1];
    measured.push({
      group: groupOf(base, category),
      ret7: returnOver(closes, REGIME_CONFIG.shortBars),
      ret30: returnOver(closes, REGIME_CONFIG.longBars),
      er30: efficiencyRatio(closes, REGIME_CONFIG.longBars),
      ribbon: ribbonState(closes),
      aboveVwap: qv === null ? null : closes[closes.length - 1] > qv,
    });
  }

  const byGroup = new Map<string, Measured[]>();
  for (const m of measured) {
    const g = byGroup.get(m.group);
    if (g) g.push(m);
    else byGroup.set(m.group, [m]);
  }

  const groups = Array.from(byGroup.entries())
    .filter(([, rows]) => rows.length >= REGIME_CONFIG.minGroupN)
    .map(([name, rows]) => aggregate(name, rows))
    .sort((a, b) => b.n - a.n);

  return { groups, universe: aggregate("universe", measured), asOf };
}
