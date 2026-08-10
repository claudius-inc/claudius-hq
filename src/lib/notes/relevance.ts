/**
 * Which stocks actually matter today — see docs/daily-note-v2-spec.md §A.
 *
 * v1 surfaced names two ways only: distance from their sector's move, and SPY
 * weight. So a small utility bucking a red sector outranked a mega-cap on a real
 * move. This scores the whole index on inputs that already ride the batch quote
 * the pipeline pays for, then admits names by two routes.
 *
 * TREAT THE COEFFICIENTS AS A HYPOTHESIS, NOT A SPECIFICATION. Every component
 * is logged per run precisely so they can be reviewed against real output before
 * anyone calls them settled — see `logRun` at the bottom of this file for what
 * the log carries and which question each field answers.
 */
import { logger } from "@/lib/logger";

const SRC = "notes/relevance";

/** Names admitted by the relevance score itself. */
const ROUTE_1_TOP = 10;
/** Names admitted purely for the size of their move (see below). */
const ROUTE_2_TOP = 5;
/** A route-2 name must be liquid enough to be worth a reader's attention. */
const ROUTE_2_MIN_DOLLAR_VOL = 200_000_000;
/** Hard cap on the union, which bounds the follow-on chart fetches. */
const UNION_CAP = 15;

export interface RelevanceInput {
  ticker: string;
  sectorEtf: string;
  changePct: number;
  /** Its sector ETF's own move, the benchmark it is measured against. */
  sectorPct: number;
  price: number | null;
  volume: number | null;
  avgVolume10d: number | null;
  /** Weight inside its own sector SPDR (percent). */
  sectorWeight: number | null;
  /** True when today's regular session is the reaction to its report. */
  reportedToday: boolean;
}

export interface RelevanceScore extends RelevanceInput {
  gap: number;
  dollarVol: number;
  score: number;
  /** Which route admitted it — "score", "move", or "both". */
  route: "score" | "move" | "both";
  /**
   * The individual multiplicands, retained so the score can be audited rather
   * than merely observed. Without them a log line shows only that a name scored
   * 4.2, which cannot answer whether the damping factors did anything — and
   * "review the coefficients against real output" is the condition the spec puts
   * on Stage B. Cheap to carry: they are already computed to build `score`.
   */
  components: {
    /** Cross-sectional dollar-volume percentile, rank/(N+1). */
    dollarVolPct: number;
    /** sqrt(dollarVolPct) — the liquidity damp as applied. */
    liquidityDamp: number;
    /** Within-sector weight percentile mapped to [0.5, 1]. */
    bellwether: number;
    /** volume / averageDailyVolume10Day, or 1 when unavailable (never imputed). */
    rvolQ: number;
    /** The "a reason to care today" multiplier, 1.0–1.75. */
    reason: number;
  };
}

/**
 * Cross-sectional percentile as rank/(N+1).
 *
 * The +1 matters: a plain rank/N gives the least liquid name exactly 0, and
 * sqrt(0) annihilates it rather than damping it, which contradicts the intent.
 *
 * Ties take the AVERAGE of the ranks they span. Without that, equal values are
 * separated by whatever order they arrived in — and the order here is the order
 * the constituent rows came back from the database, which nothing guarantees.
 * Two names on the same dollar volume would then get different liquidity damps,
 * and the evening's second run could rank them the other way round and quietly
 * edit a different set of movers into the sent message.
 */
function percentileMap(values: { key: string; value: number }[]): Map<string, number> {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const out = new Map<string, number>();
  const n = sorted.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1].value === sorted[i].value) j++;
    // 1-based ranks i+1 … j+1, averaged across the tied block.
    const avgRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) out.set(sorted[k].key, avgRank / (n + 1));
    i = j + 1;
  }
  return out;
}

/**
 * Rank names by relevance and return the capped union of both entry routes.
 *
 * Route 1 is the score. Route 2 is raw move size above a liquidity floor, and it
 * exists because the score leads with `gap`: a mega-cap whose move IS its
 * sector's move has a gap near zero and would otherwise be invisible. Route 2
 * must select without daily bars, since bars are only fetched for the union.
 */
export function rankRelevance(inputs: RelevanceInput[]): RelevanceScore[] {
  if (inputs.length === 0) return [];

  const dollarVolOf = (i: RelevanceInput) =>
    i.price != null && i.volume != null && Number.isFinite(i.price * i.volume) ? i.price * i.volume : 0;

  const dvPct = percentileMap(inputs.map((i) => ({ key: i.ticker, value: dollarVolOf(i) })));

  // The bellwether factor is a WITHIN-SECTOR weight percentile mapped to
  // [0.5, 1]. An earlier draft used weight relative to the sector's largest
  // name, which is incoherent across sectors: in a top-heavy sector almost
  // everything collapses to the floor, while in a flat sector mid-caps sit high
  // — handing flat sectors a systematic advantage in a cross-sector ranking,
  // which re-creates the exact bias this module exists to remove.
  const bySector = new Map<string, RelevanceInput[]>();
  for (const i of inputs) {
    const list = bySector.get(i.sectorEtf);
    if (list) list.push(i);
    else bySector.set(i.sectorEtf, [i]);
  }
  const bellwether = new Map<string, number>();
  for (const [, members] of Array.from(bySector.entries())) {
    const weighted = members.filter((m) => m.sectorWeight != null);
    if (weighted.length === 0) {
      for (const m of members) bellwether.set(m.ticker, 0.75); // neutral, never imputed high
      continue;
    }
    const pct = percentileMap(weighted.map((m) => ({ key: m.ticker, value: m.sectorWeight as number })));
    for (const m of members) bellwether.set(m.ticker, 0.5 + (pct.get(m.ticker) ?? 0.5) / 2);
  }

  const scored: RelevanceScore[] = inputs.map((i) => {
    const gap = Math.abs(i.changePct - i.sectorPct);
    const dollarVol = dollarVolOf(i);
    // A missing average volume leaves the term neutral. Never imputed.
    const rvolQ =
      i.volume != null && i.avgVolume10d != null && i.avgVolume10d > 0 ? i.volume / i.avgVolume10d : 1;
    const reason = i.reportedToday ? 1.75 : Math.min(1 + Math.max(rvolQ - 1, 0) / 3, 1.75);
    const dollarVolPct = dvPct.get(i.ticker) ?? 0.5;
    const liquidityDamp = Math.sqrt(dollarVolPct);
    const bell = bellwether.get(i.ticker) ?? 0.75;
    const score = gap * liquidityDamp * bell * reason;
    return {
      ...i,
      gap,
      dollarVol,
      score,
      route: "score",
      components: { dollarVolPct, liquidityDamp, bellwether: bell, rvolQ, reason },
    };
  });

  // Ticker breaks every tie. JS sort is stable, so without it a tie sitting
  // exactly on a slice boundary is resolved by the order the constituent rows
  // came back from the database — which is unordered. The evening's second run
  // would then be free to admit a different name and edit a different set of
  // movers into the message that already went out. `changePct` is rounded to
  // 2dp upstream, so ties at the route-2 boundary are entirely plausible.
  const byScore = [...scored]
    .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
    .slice(0, ROUTE_1_TOP);
  const byMove = [...scored]
    .filter((s) => s.dollarVol >= ROUTE_2_MIN_DOLLAR_VOL)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || a.ticker.localeCompare(b.ticker))
    .slice(0, ROUTE_2_TOP);

  const route1 = new Set(byScore.map((s) => s.ticker));
  const route2 = new Set(byMove.map((s) => s.ticker));
  const union = new Map<string, RelevanceScore>();
  for (const s of [...byScore, ...byMove]) {
    if (union.has(s.ticker)) continue;
    const route: RelevanceScore["route"] =
      route1.has(s.ticker) && route2.has(s.ticker) ? "both" : route1.has(s.ticker) ? "score" : "move";
    union.set(s.ticker, { ...s, route });
  }

  const out = Array.from(union.values())
    .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
    .slice(0, UNION_CAP);

  logRun(inputs, scored, out);
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One structured line per run, carrying every multiplicand for every admitted
 * name — the review the spec makes a precondition for Stage B (§A, §I).
 *
 * The previous log carried the top 5 names and their final scores only, which
 * cannot settle any of the questions the review has to answer. Four are decidable
 * from this line, and each has a named constant behind it:
 *
 *  - `byRoute.move` near zero over many days means the mega-cap rescue never
 *    fires and ROUTE_2_TOP / the dollar-volume floor are mis-set. `route2` below
 *    reports how many names the floor excluded, so an empty route 2 can be told
 *    apart from a floor that is simply too high.
 *  - `reportedInTop5` against earnings-heavy days says whether the 1.75 reason
 *    multiplier changes the ranking or merely decorates it.
 *  - `gapTopOverlap` is the important one: how many admitted names would also
 *    have been admitted by ranking on plain `gap` alone. If that stays pinned at
 *    the full count day after day, the liquidity damp and the bellwether factor
 *    reorder nothing, and the "a small utility outranks a mega-cap" failure this
 *    module exists to fix is still live behind a more complicated formula.
 *    Deliberately a plain count rather than a rank correlation: a correlation
 *    over ~500 mostly-irrelevant names is dominated by the tail we never print,
 *    so it would answer a question nobody asked.
 *  - `nearMiss` is the highest-scoring names that were NOT admitted — the ones
 *    a small coefficient change would pull in. Note this is decided at
 *    ROUTE_1_TOP (10), not at UNION_CAP: with the current constants
 *    ROUTE_1_TOP + ROUTE_2_TOP == UNION_CAP, so the union cap never actually
 *    cuts anyone and is purely a guard against a future constant change.
 */
function logRun(inputs: RelevanceInput[], scored: RelevanceScore[], admitted: RelevanceScore[]): void {
  const belowFloor = scored.filter((s) => s.dollarVol < ROUTE_2_MIN_DOLLAR_VOL).length;
  const admittedSet = new Set(admitted.map((a) => a.ticker));
  const byScore = [...scored].sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
  const nearMiss = byScore.filter((s) => !admittedSet.has(s.ticker)).slice(0, 3);

  // Would ranking on gap alone have picked the same names?
  const byGap = [...scored]
    .sort((a, b) => b.gap - a.gap || a.ticker.localeCompare(b.ticker))
    .slice(0, admitted.length);
  const gapTopOverlap = byGap.filter((s) => admittedSet.has(s.ticker)).length;

  logger.info(SRC, "Relevance ranked", {
    universe: inputs.length,
    admitted: admitted.length,
    byRoute: {
      score: admitted.filter((o) => o.route === "score").length,
      move: admitted.filter((o) => o.route === "move").length,
      both: admitted.filter((o) => o.route === "both").length,
    },
    route2: { floorUsd: ROUTE_2_MIN_DOLLAR_VOL, excludedByFloor: belowFloor, eligible: scored.length - belowFloor },
    reportedInTop5: admitted.slice(0, 5).filter((o) => o.reportedToday).length,
    reportedInUniverse: inputs.filter((i) => i.reportedToday).length,
    gapTopOverlap: `${gapTopOverlap}/${admitted.length}`,
    // Every admitted name with every multiplicand — this is the review data.
    names: admitted.map((o) => ({
      t: o.ticker,
      sec: o.sectorEtf,
      score: r2(o.score),
      gap: r2(o.gap),
      chg: o.changePct,
      dvPct: r2(o.components.dollarVolPct),
      damp: r2(o.components.liquidityDamp),
      bell: r2(o.components.bellwether),
      rvol: r2(o.components.rvolQ),
      reason: r2(o.components.reason),
      dvUsdM: Math.round(o.dollarVol / 1e6),
      route: o.route,
      reported: o.reportedToday,
    })),
    nearMiss: nearMiss.map((o) => ({ t: o.ticker, score: r2(o.score), gap: r2(o.gap), chg: o.changePct })),
  });
}

