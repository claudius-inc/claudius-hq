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
 * anyone calls them settled.
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
}

/**
 * Cross-sectional percentile as rank/(N+1). The +1 matters: a plain rank/N
 * gives the least liquid name exactly 0, and sqrt(0) annihilates it rather than
 * damping it, which contradicts the intent.
 */
function percentileMap(values: { key: string; value: number }[]): Map<string, number> {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const out = new Map<string, number>();
  sorted.forEach((v, i) => out.set(v.key, (i + 1) / (sorted.length + 1)));
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
    const score = gap * Math.sqrt(dvPct.get(i.ticker) ?? 0.5) * (bellwether.get(i.ticker) ?? 0.75) * reason;
    return { ...i, gap, dollarVol, score, route: "score" };
  });

  const byScore = [...scored].sort((a, b) => b.score - a.score).slice(0, ROUTE_1_TOP);
  const byMove = [...scored]
    .filter((s) => s.dollarVol >= ROUTE_2_MIN_DOLLAR_VOL)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
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
    .sort((a, b) => b.score - a.score)
    .slice(0, UNION_CAP);

  logger.info(SRC, "Relevance ranked", {
    universe: inputs.length,
    admitted: out.length,
    byRoute: {
      score: out.filter((o) => o.route === "score").length,
      move: out.filter((o) => o.route === "move").length,
      both: out.filter((o) => o.route === "both").length,
    },
    top: out.slice(0, 5).map((o) => ({
      t: o.ticker,
      score: Math.round(o.score * 100) / 100,
      gap: o.gap,
      chg: o.changePct,
      route: o.route,
      reported: o.reportedToday,
    })),
  });
  return out;
}
