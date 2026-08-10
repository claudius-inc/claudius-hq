/**
 * THE WEEK REVIEWED — see docs/daily-note-v2-spec.md §C.
 *
 * The wrap's reason to exist. Everything else it prints is a restatement of the
 * week; this is the only part that looks back at what the daily notes actually
 * claimed and says what became of it.
 *
 * Three rules shape every line below, and they are what keep this a review
 * rather than a scorecard:
 *
 *  1. **The denominator is always printed.** "4 of 6 flags held" is a finding;
 *     "4 flags held" is selective narration. Where a figure could not be
 *     computed, the count says so rather than the item disappearing.
 *  2. **No scoring verb, anywhere.** The pin was never a prediction and the
 *     prose was never a bet. Distances and juxtapositions only — the moment this
 *     reads as "we called it", it has become the coin-flip-dressed-as-skill the
 *     spec refuses.
 *  3. **Follow-through is measured against the sector, not in isolation.** The
 *     daily note's claim was relative ("green in a red sector"), so resolving it
 *     absolutely would grade a claim nobody made.
 */
import { logger } from "@/lib/logger";
import { deterministicHook } from "@/lib/notes/render";
import { fetchDailyBars, changeBetween, toYahooSymbol } from "@/lib/notes/sources/daily-bars";
import type { StructuredFacts, NoteProse } from "@/lib/notes/types";

const SRC = "notes/weekly-review";

/** A close within this of the prior session's pin strike counts as "near". */
const PIN_NEAR_PCT = 0.5;
/** Percentile lines a VIX move is reported as crossing. */
const VIX_BANDS = [25, 50, 75];
/** How many single-name moves the wrap lists. */
const MAX_BIG_MOVES = 3;
/** How many recurring index contributors the wrap names. */
const MAX_RECURRING = 3;

export interface FollowThroughName {
  ticker: string;
  sectorEtf: string;
  /** The session whose note flagged it. */
  flaggedOn: string;
  /** Signed distance from its sector's move on that day, in points. */
  gapAtFlag: number;
  /** The name's move from the flag date to the week's end. */
  namePct: number;
  /** Its sector ETF's move over the same window. */
  sectorPct: number;
  /** True when the relative move kept the sign of the original divergence. */
  kept: boolean;
}

export interface WeeklyReview {
  followThrough: {
    flagged: number;
    checkable: number;
    kept: number;
    names: FollowThroughName[];
  } | null;
  pin: {
    /** Overnights where both a pin and the next close were available. */
    checkable: number;
    /** Overnights the week offered, checkable or not. */
    total: number;
    near: number;
    nearPct: number;
    overnights: { pinnedOn: string; pinStrike: number; nextClose: number; distancePct: number }[];
  } | null;
  biggestMoves: {
    sessionsCovered: number;
    totalSessions: number;
    names: { ticker: string; changePct: number; date: string }[];
  } | null;
  concentration: {
    reconciledSessions: number;
    totalSessions: number;
    flipDays: number;
    recurring: { ticker: string; days: number }[];
  } | null;
  vixRegime: {
    startPercentile: number;
    endPercentile: number;
    /** Percentile lines the week's move crossed, if any. */
    crossed: number[];
    direction: "up" | "down";
  } | null;
  quoted: { date: string; hook: string } | null;
}

export interface ReviewDay {
  date: string;
  facts: StructuredFacts;
  prose: NoteProse | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Divergence follow-through.
 *
 * Scoped to `divergence.value[0]` — the ONLY block the push printed. Following
 * through every sector's flags would resolve claims the note never made, which
 * inflates the denominator with work nobody saw and quietly changes what is
 * being reviewed.
 *
 * A flag made on the week's last session has an empty window. It stays in
 * `flagged` and out of `checkable`, so the ratio never flatters itself by
 * dropping the ones it cannot answer — and so flagging late cannot improve it.
 */
async function computeFollowThrough(days: ReviewDay[], weekEnd: string): Promise<WeeklyReview["followThrough"]> {
  interface Flag {
    ticker: string;
    sectorEtf: string;
    flaggedOn: string;
    gapAtFlag: number;
  }
  const flags: Flag[] = [];
  for (const d of days) {
    const top = d.facts.divergence?.value[0];
    if (!top) continue;
    for (const n of top.names) {
      flags.push({ ticker: n.ticker, sectorEtf: top.etf, flaggedOn: d.date, gapAtFlag: n.gap });
    }
  }
  if (flags.length === 0) return null;

  // A flag repeated on several days is followed through from its FIRST
  // appearance: that is when the note first made the claim, and re-registering
  // it daily would weight a persistent divergence more heavily than a sharp one.
  const firstFlag = new Map<string, Flag>();
  for (const f of flags) if (!firstFlag.has(f.ticker)) firstFlag.set(f.ticker, f);
  const unique = Array.from(firstFlag.values());

  // A flag made ON the closing session has no window. It is excluded from the
  // scoring loop — measuring a bar against itself returns 0, and a zero relative
  // move scores as faded, which would grade a claim that never had time to play
  // out. It stays in `flagged`, so the ratio cannot be improved by flagging
  // things late: `flagged - checkable` is printed as unresolved.
  const withWindow = unique.filter((f) => f.flaggedOn < weekEnd);

  const earliest = withWindow.reduce<string>((min, f) => (f.flaggedOn < min ? f.flaggedOn : min), weekEnd);
  const symbols = new Set<string>();
  for (const f of withWindow) {
    symbols.add(toYahooSymbol(f.ticker));
    symbols.add(f.sectorEtf);
  }

  const barsBySymbol = new Map<string, Awaited<ReturnType<typeof fetchDailyBars>>>();
  for (const s of Array.from(symbols)) {
    barsBySymbol.set(s, await fetchDailyBars(s, earliest));
  }

  const names: FollowThroughName[] = [];
  for (const f of withWindow) {
    const nameBars = barsBySymbol.get(toYahooSymbol(f.ticker));
    const sectorBars = barsBySymbol.get(f.sectorEtf);
    if (!nameBars || !sectorBars) continue;
    const namePct = changeBetween(nameBars, f.flaggedOn, weekEnd, f.ticker);
    const sectorPct = changeBetween(sectorBars, f.flaggedOn, weekEnd, f.sectorEtf);
    // Both legs or neither. A name resolved against a missing sector leg would
    // silently become an absolute claim.
    if (namePct == null || sectorPct == null) continue;
    names.push({
      ticker: f.ticker,
      sectorEtf: f.sectorEtf,
      flaggedOn: f.flaggedOn,
      gapAtFlag: f.gapAtFlag,
      namePct,
      sectorPct,
      kept: Math.sign(namePct - sectorPct) === Math.sign(f.gapAtFlag),
    });
  }

  logger.info(SRC, "Divergence follow-through", {
    flagged: unique.length,
    withWindow: withWindow.length,
    checkable: names.length,
    kept: names.filter((n) => n.kept).length,
  });

  // Note the section survives `names.length === 0`. If every fetch failed, "0
  // of 0 checkable, of 6 flagged" is the honest report; letting the item vanish
  // would present a data outage as a week with nothing to review.
  return {
    flagged: unique.length,
    checkable: names.length,
    kept: names.filter((n) => n.kept).length,
    names,
  };
}

/**
 * Gamma-pin adherence — pure arithmetic on stored strikes, zero fetches.
 *
 * For each consecutive session pair, how far the next close landed from the
 * previous session's pin. This is NOT a prediction being graded: the pin comes
 * from start-of-day open interest and the note never claimed the market would
 * go there. The line reports distance and nothing else.
 */
function computePin(days: ReviewDay[], startFacts: StructuredFacts, weekStart: string): WeeklyReview["pin"] {
  const sequence: { date: string; facts: StructuredFacts }[] = [
    // The anchor's real date, not the word "anchor" — the web page prints this.
    { date: weekStart, facts: startFacts },
    ...days.map((d) => ({ date: d.date, facts: d.facts })),
  ];

  const overnights: NonNullable<WeeklyReview["pin"]>["overnights"] = [];
  let total = 0;
  for (let i = 0; i + 1 < sequence.length; i++) {
    total++;
    const pin = sequence[i].facts.gexPin?.value;
    const next = sequence[i + 1].facts.gexPin?.value;
    // The next session's `spot` is the post-close price of the same symbol, so
    // the two are comparable only when both days priced the same instrument.
    if (!pin || !next || pin.symbol !== next.symbol) continue;
    if (pin.pinStrike === 0) continue;
    const distancePct = r2(((next.spot - pin.pinStrike) / pin.pinStrike) * 100);
    overnights.push({
      pinnedOn: sequence[i].date,
      pinStrike: pin.pinStrike,
      nextClose: next.spot,
      distancePct,
    });
  }

  if (overnights.length === 0) return null;
  const near = overnights.filter((o) => Math.abs(o.distancePct) <= PIN_NEAR_PCT).length;
  return { checkable: overnights.length, total, near, nearPct: PIN_NEAR_PCT, overnights };
}

/**
 * The week's biggest single-name moves, from the stored relevance ranking.
 *
 * These are DAILY moves among the names the notes surfaced — not weekly moves,
 * and not the biggest movers in the index. Both of those would need data we do
 * not have (a week-cumulative figure needs fetches; an all-503 claim needs
 * membership history the seed destroys), so the label has to say what it is.
 */
function computeBiggestMoves(days: ReviewDay[]): WeeklyReview["biggestMoves"] {
  const pool: { ticker: string; changePct: number; date: string }[] = [];
  let sessionsCovered = 0;
  for (const d of days) {
    const movers = d.facts.movers?.value;
    if (!movers?.length) continue;
    sessionsCovered++;
    for (const m of movers) pool.push({ ticker: m.ticker, changePct: m.changePct, date: d.date });
  }
  if (pool.length === 0) return null;

  // One entry per ticker — its largest day — so a name that moved every day does
  // not take every slot.
  const best = new Map<string, { ticker: string; changePct: number; date: string }>();
  for (const p of pool) {
    const cur = best.get(p.ticker);
    if (!cur || Math.abs(p.changePct) > Math.abs(cur.changePct)) best.set(p.ticker, p);
  }

  const names = Array.from(best.values())
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || a.ticker.localeCompare(b.ticker))
    .slice(0, MAX_BIG_MOVES);

  return { sessionsCovered, totalSessions: days.length, names };
}

/**
 * Index concentration, over the sessions where the reconciliation gate passed.
 *
 * A `contribution` fact exists only when Σ(weight × move) reconciled against the
 * actual index move, so its presence IS the gate. The count of passing sessions
 * is printed next to the total: concentration measured on two of five days is a
 * different claim from concentration measured on five.
 */
function computeConcentration(days: ReviewDay[]): WeeklyReview["concentration"] {
  const reconciled = days.filter((d) => d.facts.contribution != null);
  if (reconciled.length === 0) return null;

  const freq = new Map<string, number>();
  for (const d of reconciled) {
    for (const t of d.facts.contribution!.value.topNames) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const recurring = Array.from(freq.entries())
    .map(([ticker, n]) => ({ ticker, days: n }))
    .sort((a, b) => b.days - a.days || a.ticker.localeCompare(b.ticker))
    .filter((r) => r.days > 1)
    .slice(0, MAX_RECURRING);

  return {
    reconciledSessions: reconciled.length,
    totalSessions: days.length,
    flipDays: reconciled.filter((d) => d.facts.contribution!.value.flipsWithoutTop).length,
    recurring,
  };
}

/**
 * Volatility regime, as a percentile-band crossing.
 *
 * The percentile is each day's own rank within THIS YEAR's closes, so the
 * distribution shifts slightly across the week. That is why only the two
 * endpoints are compared and no intra-week whipsaw is counted — the basis is
 * disclosed in the rendered line rather than assumed away.
 */
function computeVixRegime(days: ReviewDay[], startFacts: StructuredFacts): WeeklyReview["vixRegime"] {
  const start = startFacts.vix?.value;
  const end = days[days.length - 1]?.facts.vix?.value;
  if (!start || !end) return null;
  const lo = Math.min(start.percentile, end.percentile);
  const hi = Math.max(start.percentile, end.percentile);
  return {
    startPercentile: start.percentile,
    endPercentile: end.percentile,
    crossed: VIX_BANDS.filter((band) => lo < band && hi >= band),
    direction: end.percentile >= start.percentile ? "up" : "down",
  };
}

/**
 * What we wrote, quoted — juxtaposition only.
 *
 * The earliest session with prose, because that is the claim the week had the
 * longest to answer. Only the hook: it is short, it was numeral-validated on the
 * day, and it is the one line written to survive a notification preview.
 *
 * Quoting the deterministic fallback hook would be dishonest — that is a
 * template the renderer produced, not something the note thought. And it CAN
 * reach the stored prose: when only the hook fails validation, `applyFallbacks`
 * substitutes the template into the object that then gets persisted. So the
 * template is reconstructed here and skipped rather than assumed absent.
 */
function computeQuote(days: ReviewDay[]): WeeklyReview["quoted"] {
  for (const d of days) {
    const hook = d.prose?.hook?.trim();
    if (!hook) continue;
    if (hook === deterministicHook(d.facts).trim()) {
      logger.info(SRC, "Skipping a template hook — nothing was written that day", { date: d.date });
      continue;
    }
    return { date: d.date, hook };
  }
  return null;
}

/** Build the whole review. Any section that cannot be computed honestly is null. */
export async function buildWeeklyReview(
  days: ReviewDay[],
  startFacts: StructuredFacts,
  weekEnd: string,
  weekStart: string,
): Promise<WeeklyReview> {
  const followThrough = await computeFollowThrough(days, weekEnd);
  return {
    followThrough,
    pin: computePin(days, startFacts, weekStart),
    biggestMoves: computeBiggestMoves(days),
    concentration: computeConcentration(days),
    vixRegime: computeVixRegime(days, startFacts),
    quoted: computeQuote(days),
  };
}
