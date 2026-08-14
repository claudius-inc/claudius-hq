/**
 * Economic releases — see docs/daily-note-v2-spec.md §E.
 *
 * FRED's release calendar is free and answers "what lands today, and this week".
 * It does not itself carry consensus — but a free source for that DOES exist and
 * §I was wrong to call the question settled. See `nasdaq-consensus.ts`. Each print
 * is reported against the street's median where one could be sourced and
 * unambiguously joined, and against its prior where it could not.
 *
 * The prior is never dropped: it is what makes the line survive a consensus
 * outage, and a revision is often larger than the surprise being reported.
 *
 * Four things a naive implementation gets wrong, all handled here:
 *
 *  1. A release maps to thousands of series, so the whitelist is
 *     (release, series, transform) triples. The transform uses FRED's own
 *     `units` parameter rather than hand-rolled arithmetic.
 *  2. Headline CPI year-over-year comes from the NOT-seasonally-adjusted series.
 *     CPIAUCSL (SA) and CPIAUCNS (NSA) differ — 3.46% vs 3.53% for one recent
 *     month — and quoting the wrong one puts us at odds with every published
 *     headline.
 *  3. FRED's "prior" is the value as revised TODAY, not as published at the
 *     time. One payrolls month was first printed at 158,984k and stood at
 *     158,881k five weeks later — a revision larger than most surprises. The
 *     `realtime_*` parameters recover the figure as originally published.
 *  4. FOMC is deliberately absent. Its FRED release dates every calendar day
 *     including weekends (it carries daily series), so a whitelist entry would
 *     announce "FOMC lands today" every single day, and the rate is unchanged
 *     at all but a handful of observations a year. Treat FOMC as a calendar
 *     event elsewhere, never as actual-vs-prior.
 */
import { logger } from "@/lib/logger";
import type { Fact, MacroRelease, MacroContext, EconEvent } from "@/lib/notes/types";
import type { ConnectorHealth } from "@/lib/notes/health";
import { fetchConsensus, matchRow, consensusHealth } from "@/lib/notes/sources/nasdaq-consensus";

const SRC = "notes/fred-releases";
const BASE = "https://api.stlouisfed.org/fred";
/** How many forward events the push can carry. FOMC is exempt — see below. */
const MAX_EVENTS = 4;

/**
 * Provenance, and the one wording rule that matters.
 *
 * These strings are persisted into every stored note, and the archive page
 * re-renders old notes with NEW component code. So the no-consensus form must
 * assert the BASIS of the figures in front of it and never make a claim about the
 * world: "no free feed carries consensus" was true when §I was written, it is
 * false now, and rendering it onto an old note would be a freshly false sentence
 * rather than a caveat. Archived `source` strings are left exactly as written.
 */
const SOURCE_RELEASES = (withConsensus: boolean) =>
  withConsensus
    ? "FRED + Investing.com survey median via Nasdaq"
    : "FRED (measured against the prior reading)";

const SOURCE_CALENDAR = (withConsensus: boolean) =>
  withConsensus
    ? "FRED + Federal Reserve calendar + Investing.com survey median via Nasdaq"
    : "FRED release calendar + Federal Reserve calendar";

interface ReleaseSpec {
  releaseId: number;
  seriesId: string;
  label: string;
  /** FRED units transform: pc1 = year-over-year %, pch = month-over-month %, chg = level change. */
  units: "pc1" | "pch" | "chg" | "lin";
  /** ET clock. FRED publishes dates only, so release times are a fixed map. */
  timeEt: string;
  suffix: string;
  dp: number;
  /** Multiply the raw value before display. ICSA is a raw count, not thousands. */
  scale?: number;
  /** Whether a leading "+" belongs. True for changes, false for levels. */
  signed: boolean;
  /**
   * How stale the observation may be relative to the release date before we
   * refuse to print it. This is the guard against the failure the whole section
   * exists to avoid: if FRED has not yet ingested this morning's figure, the
   * latest observation is LAST period's, and printing it on release day would
   * present weeks-old data as today's news. Sized by frequency.
   */
  maxAgeDays: number;
  /**
   * The event's name on Nasdaq's calendar, transcribed from a live payload.
   * Absent means this release does not carry consensus — see the GDP note.
   */
  nasdaqEventName?: string;
  /**
   * The seasonally adjusted twin, for short-horizon arithmetic only. The headline
   * still comes from `seriesId`. Also used for `publishedAverage`, where FRED
   * publishes the derived figure directly and computing it would be worse.
   */
  contextSeriesId?: string;
  /** Which context reads correctly for this series. One formula does not fit all eight. */
  contextKind?: "index" | "count" | "rate" | "average" | "publishedAverage" | "none";
}

/**
 * The releases a market reader actually positions around.
 *
 * `nasdaqEventName` is TRANSCRIBED from a real payload on a real release day,
 * never guessed — the same discipline `FOMC_DECISIONS` follows. A guessed name
 * yields zero matches forever, and that is invisible without the join-health
 * signal in `consensusHealth`. Each one below was read off the live calendar on
 * 2026-08-13/14 and checked against this spec's own prior.
 *
 * GDP is deliberately WITHOUT a name. Its hazard is structural: the annual NIPA
 * revision lands with the Q2 advance every July and moves FRED's prior in the
 * same release. The same-release-revision mechanism predicts a match, but that
 * is extrapolated from claims, and GDP advance days come four times a year with
 * no chance to learn quietly. Observe one, then fill it in.
 *
 * `contextSeriesId` is the SEASONALLY ADJUSTED twin, used only for short-horizon
 * arithmetic. A 3-month annualized rate off an NSA series is seasonality, not
 * signal; over twelve months it cancels, which is exactly why the headline y/y is
 * correct on NSA. Two of the headline series are NSA and both need a twin.
 */
const RELEASES: ReleaseSpec[] = [
  { releaseId: 10, seriesId: "CPIAUCNS", label: "CPI y/y", units: "pc1", timeEt: "8:30", suffix: "%", dp: 1, signed: false, maxAgeDays: 60, nasdaqEventName: "CPI", contextSeriesId: "CPIAUCSL", contextKind: "index" },
  { releaseId: 46, seriesId: "PPIFID", label: "PPI y/y", units: "pc1", timeEt: "8:30", suffix: "%", dp: 1, signed: false, maxAgeDays: 60, nasdaqEventName: "PPI", contextSeriesId: "PPIFIS", contextKind: "index" },
  { releaseId: 50, seriesId: "PAYEMS", label: "Payrolls", units: "chg", timeEt: "8:30", suffix: "k", dp: 0, signed: true, maxAgeDays: 60, nasdaqEventName: "Nonfarm Payrolls", contextKind: "count" },
  { releaseId: 50, seriesId: "UNRATE", label: "Unemployment", units: "lin", timeEt: "8:30", suffix: "%", dp: 1, signed: false, maxAgeDays: 60, nasdaqEventName: "Unemployment Rate", contextKind: "rate" },
  { releaseId: 54, seriesId: "PCEPILFE", label: "Core PCE y/y", units: "pc1", timeEt: "8:30", suffix: "%", dp: 1, signed: false, maxAgeDays: 70, nasdaqEventName: "Core PCE Price Index", contextKind: "index" },
  { releaseId: 9, seriesId: "RSAFS", label: "Retail sales m/m", units: "pch", timeEt: "8:30", suffix: "%", dp: 1, signed: true, maxAgeDays: 60, nasdaqEventName: "Retail Sales", contextKind: "average" },
  { releaseId: 180, seriesId: "ICSA", label: "Jobless claims", units: "lin", timeEt: "8:30", suffix: "k", dp: 0, scale: 1e-3, signed: false, maxAgeDays: 8, nasdaqEventName: "Initial Jobless Claims", contextKind: "publishedAverage", contextSeriesId: "IC4WSA" },
  { releaseId: 53, seriesId: "A191RL1Q225SBEA", label: "GDP q/q ann. (advance)", units: "lin", timeEt: "8:30", suffix: "%", dp: 1, signed: true, maxAgeDays: 130, contextKind: "none" },
];

/**
 * What a release is CALLED when we announce it ahead of time.
 *
 * A release maps to several whitelisted series (release 50 carries both
 * payrolls and the unemployment rate), so the forward-looking section names the
 * release, not the series — "Employment Situation lands 8:30 ET", never two
 * lines for one event.
 */
const RELEASE_NAMES: Record<number, string> = {
  10: "CPI",
  46: "PPI",
  50: "Employment Situation",
  54: "PCE",
  9: "Retail sales",
  180: "Jobless claims",
  53: "GDP",
};

/**
 * FOMC decision dates, as an explicit static list — see v2 spec §E.2.
 *
 * FRED cannot supply these. Release 101 carries daily series, so FRED dates it
 * every single calendar day including weekends; a whitelist entry would
 * announce "FOMC lands today" forever. The Fed publishes its own calendar years
 * ahead, so the honest source is a hand-maintained list.
 *
 * TRANSCRIBED, NEVER GUESSED, from
 * https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm on 2026-08-13.
 * A wrong FOMC date is the most damaging single error this note can make, so
 * when this list runs out it must be refilled from that page and nowhere else —
 * do not extrapolate the pattern, and do not carry a date forward from memory.
 *
 * The DATE here is the second day of a two-day meeting, because that is the day
 * the decision lands. The statement is released at 14:00 ET; the press
 * conference follows at 14:30 and is not a separate event.
 *
 * The Fed's own footnote applies and is the reason this list stops at 2027:
 * "Each meeting date is tentative until confirmed at the meeting immediately
 * preceding it."
 *
 * Framed as an EVENT, never as actual-vs-prior: the target rate is unchanged at
 * all but a handful of observations a year, and the content that matters —
 * statement, projections — is not a FRED series at all.
 */
const FOMC_DECISIONS: { date: string; timeEt: string; projections: boolean }[] = [
  // 2026
  { date: "2026-01-28", timeEt: "14:00", projections: false },
  { date: "2026-03-18", timeEt: "14:00", projections: true },
  { date: "2026-04-29", timeEt: "14:00", projections: false },
  { date: "2026-06-17", timeEt: "14:00", projections: true },
  { date: "2026-07-29", timeEt: "14:00", projections: false },
  { date: "2026-09-16", timeEt: "14:00", projections: true },
  { date: "2026-10-28", timeEt: "14:00", projections: false },
  { date: "2026-12-09", timeEt: "14:00", projections: true },
  // 2027 — listed by the Fed as a future year, so every date is tentative.
  { date: "2027-01-27", timeEt: "14:00", projections: false },
  { date: "2027-03-17", timeEt: "14:00", projections: true },
  { date: "2027-04-28", timeEt: "14:00", projections: false },
  { date: "2027-06-09", timeEt: "14:00", projections: true },
  { date: "2027-07-28", timeEt: "14:00", projections: false },
  { date: "2027-09-15", timeEt: "14:00", projections: true },
  { date: "2027-10-27", timeEt: "14:00", projections: false },
  { date: "2027-12-08", timeEt: "14:00", projections: true },
];

/**
 * A projection meeting is a different event from a plain one — the dot plot is
 * what reprices the front end, and a reader positions around it differently.
 * Carried in the NAME rather than as a field on `EconEvent`, because the name is
 * already the whole claim the section makes and a second field would have to be
 * rendered somewhere anyway.
 */
const FOMC_NAME = (projections: boolean) =>
  projections ? "FOMC decision + projections" : "FOMC decision";

/**
 * Sort key for the forward calendar.
 *
 * `date + timeEt` compared directly is wrong the moment a release does not print
 * at 8:30: "14:00" sorts BEFORE "8:30" lexicographically, so the FOMC would lead
 * a day it actually closes. Zero-padding the hour is the whole fix. Anything
 * that does not parse falls back to the raw string rather than throwing — a
 * mis-ordered event is better than a dropped section.
 */
function eventSortKey(e: EconEvent): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(e.timeEt);
  return m ? `${e.date} ${m[1].padStart(2, "0")}:${m[2]}` : `${e.date} ${e.timeEt}`;
}

const isFomc = (e: EconEvent) => e.name.startsWith("FOMC");

/** Runway below this and the list needs refilling; below the second, urgently. */
const FOMC_WARN_DAYS = 120;
const FOMC_CRITICAL_DAYS = 30;

/**
 * Health for a HAND-MAINTAINED LIST, which is the failure no liveness check sees.
 *
 * `FOMC_DECISIONS` shipped as an empty array for months and every run was
 * perfectly healthy, because a static array has nothing to fail. A hand-kept list
 * is a source whose "fetch" is a date comparison, so it belongs in the same
 * registry and the same digest — that is the only thing that guarantees anyone
 * looks at it.
 *
 * The Fed publishes the following year by mid-year, so 120 days is ample notice.
 * The 30-day escalation exists because a `degraded` that only reminds weekly can
 * otherwise be snoozed for the whole four months.
 */
export function fomcHorizonHealth(marketDate: string): ConnectorHealth {
  const future = FOMC_DECISIONS.map((m) => m.date).filter((d) => d >= marketDate).sort();
  const name = "FOMC calendar";
  if (future.length === 0) {
    return { name, status: "down", detail: "no future meetings listed — refill from federalreserve.gov" };
  }
  const runway = (Date.parse(`${future[future.length - 1]}T00:00:00Z`) - Date.parse(`${marketDate}T00:00:00Z`)) / 86_400_000;
  if (runway < FOMC_CRITICAL_DAYS) {
    return { name, status: "down", detail: `only ${Math.round(runway)} days of meetings left — refill from federalreserve.gov` };
  }
  if (runway < FOMC_WARN_DAYS) {
    return { name, status: "degraded", detail: `${Math.round(runway)} days of meetings left — refill from federalreserve.gov` };
  }
  return { name, status: "ok", itemsGot: future.length };
}

/**
 * The forward calendar, in time order and trimmed to what the push can carry.
 *
 * The cap keeps the push inside its character budget, but trimming the FOMC out
 * of an FOMC week is the one case where the cap costs more than it saves: it is
 * the single event that reprices the whole curve, and a busy week is exactly
 * when it gets pushed past fourth place. So it is kept and the data releases
 * fill the slots that remain.
 *
 * Exported for its own test. The two failures it guards — a 14:00 event sorting
 * ahead of an 8:30 one, and the FOMC falling off the end of a crowded week —
 * are both silent, and neither is visible in any log.
 */
export function orderEvents(events: EconEvent[], max = MAX_EVENTS): EconEvent[] {
  const byTime = (a: EconEvent, b: EconEvent) => eventSortKey(a).localeCompare(eventSortKey(b));
  const sorted = [...events].sort(byTime);
  const fomc = sorted.filter(isFomc);
  if (fomc.length === 0) return sorted.slice(0, max);
  const rest = sorted.filter((e) => !isFomc(e)).slice(0, Math.max(0, max - fomc.length));
  return [...fomc, ...rest].sort(byTime);
}

function key(): string | null {
  return process.env.FRED_API_KEY || null;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) {
      logger.warn(SRC, `FRED request failed: ${res.status}`, { path: path.replace(/api_key=[^&]+/, "api_key=***") });
      return null;
    }
    return (await res.json()) as T;
  } catch (error) {
    logger.warn(SRC, "FRED request error", { error });
    return null;
  }
}

/**
 * Which whitelisted releases fall in [from, to] (ET dates, inclusive).
 * `include_release_dates_with_no_data=true` is load-bearing: without it the
 * endpoint returns no FUTURE dates, which is exactly what a "this week" query
 * needs.
 */
async function releaseDatesIn(
  from: string,
  to: string,
  realtimeStart: string,
): Promise<{ answered: boolean; byRelease: Map<number, string[]> }> {
  const k = key();
  const byRelease = new Map<number, string[]>();
  if (!k) return { answered: false, byRelease };

  const ids = Array.from(new Set(RELEASES.map((r) => r.releaseId)));
  let answered = false;
  for (const id of ids) {
    // `realtime_start` must never be in the future — FRED rejects the request,
    // and the forward-looking window asks for exactly that. It is therefore a
    // separate argument (today), not the window start, and the returned dates
    // are filtered to [from, to] below.
    const json = await getJson<{ release_dates?: { date: string }[] }>(
      `/release/dates?release_id=${id}&realtime_start=${realtimeStart}&realtime_end=${to}` +
        `&include_release_dates_with_no_data=true&api_key=${k}&file_type=json`,
    );
    // One successful reply is enough to know the CALENDAR was reachable, which
    // is the only question the callers need answered. Without this flag an
    // empty map means both "FRED says nothing is scheduled" and "every request
    // failed", and the page renders opposite claims from the same null.
    if (json) answered = true;
    const dates = (json?.release_dates ?? []).map((d) => d.date).filter((d) => d >= from && d <= to);
    if (dates.length > 0) byRelease.set(id, Array.from(new Set(dates)).sort());
  }
  return { answered, byRelease };
}

/**
 * Releases SCHEDULED in [from, to] — the note's forward-looking TELLS.
 *
 * This replaces a paid-calendar dependency that never once fired in production:
 * FMP's economic calendar is plan-restricted, no key was ever configured, and
 * the section it fed silently rendered as nothing every night. FRED answers the
 * same question — what lands, and when — for free, on the key already in use.
 *
 * Consensus is attached separately and only reaches about ONE session forward —
 * measured, the calendar carries tomorrow's median and is blank four days out.
 * Beyond that the twelve-month range stands in, which is why every event gets one.
 * An announcement with no number is still honest and useful.
 */
export async function fetchUpcomingReleases(
  from: string,
  to: string,
  today: string,
  asOf: string,
): Promise<{ fact: Fact<EconEvent[]> | null; health: ConnectorHealth[] }> {
  if (!key()) {
    logger.info(SRC, "FRED_API_KEY not set — upcoming releases omitted");
    return { fact: null, health: [{ name: "FRED calendar", status: "down", detail: "FRED_API_KEY not set" }] };
  }

  const events: EconEvent[] = [];

  const { answered, byRelease } = await releaseDatesIn(from, to, today);
  for (const [releaseId, dates] of Array.from(byRelease.entries())) {
    const name = RELEASE_NAMES[releaseId];
    // Every whitelisted series for a release shares one publication time, so
    // the first spec's clock is the release's clock.
    const timeEt = RELEASES.find((r) => r.releaseId === releaseId)?.timeEt;
    if (!name || !timeEt) continue;
    for (const date of dates) events.push({ name, date, timeEt });
  }

  for (const m of FOMC_DECISIONS) {
    if (m.date >= from && m.date <= to) {
      events.push({ name: FOMC_NAME(m.projections), date: m.date, timeEt: m.timeEt });
    }
  }

  // "FRED answered and the week ahead is empty" is a FACT the reader can use;
  // "we never reached FRED" is not. Only the second is null — see `Absent`,
  // which renders a different sentence for each.
  //
  // The FOMC list is static, so it alone cannot tell us the calendar was
  // reachable. `answered` still has to come from FRED.
  if (events.length === 0) {
    if (!answered) return { fact: null, health: [{ name: "FRED calendar", status: "down", detail: "no answer" }] };
    return {
      fact: { value: [], source: SOURCE_CALENDAR(false), asOf },
      health: [{ name: "FRED calendar", status: "empty", detail: "nothing scheduled in the window" }],
    };
  }
  const value = orderEvents(events);
  await attachExpectations(value, asOf);
  const withConsensus = value.some((e) => e.expects);
  logger.info(SRC, "Upcoming releases loaded", {
    count: value.length,
    dropped: events.length - value.length,
    withConsensus: value.filter((e) => e.expects).length,
    from,
    to,
  });
  return {
    fact: { value, source: SOURCE_CALENDAR(withConsensus), asOf },
    health: [{ name: "FRED calendar", status: "ok", itemsExpected: events.length, itemsGot: value.length }],
  };
}

/**
 * Attach what the street expects, and a twelve-month range as the fallback.
 *
 * Consensus reaches about ONE SESSION forward and no further — measured, the
 * calendar is populated for tomorrow's print and blank four days out. So the
 * expectation is looked up only for the nearest date, and every event still gets
 * a range, which is what makes the line worth reading when no survey has been
 * published yet.
 *
 * Neither is fatal: an event with neither still renders as name and time, exactly
 * as it does today.
 */
async function attachExpectations(events: EconEvent[], asOf: string): Promise<void> {
  const nearest = events[0]?.date;
  if (!nearest) return;

  const byName = new Map<string, ReleaseSpec[]>();
  for (const spec of RELEASES) {
    const name = RELEASE_NAMES[spec.releaseId];
    if (!name) continue;
    const list = byName.get(name);
    if (list) list.push(spec);
    else byName.set(name, [spec]);
  }

  // One calendar call, for the nearest session only.
  const fetched = await fetchConsensus(nearest);

  for (const e of events) {
    const specs = byName.get(e.name);
    // The headline series for a release is its first spec — payrolls for the
    // Employment Situation, not the unemployment rate.
    const spec = specs?.[0];
    if (!spec) continue;

    const range = await twelveMonthRange(spec);
    if (range) {
      e.range = {
        label: spec.label,
        last: range.last,
        low: range.low,
        high: range.high,
        suffix: spec.suffix,
        dp: spec.dp,
        signed: spec.signed,
      };
    }

    if (e.date !== nearest || !spec.nasdaqEventName || !fetched.rows || !range) continue;
    const row = matchRow(fetched.rows, spec.nasdaqEventName, range.last, spec.dp);
    if (row?.consensus == null) continue;
    e.expects = {
      value: row.consensus,
      prior: range.last,
      label: spec.label,
      suffix: spec.suffix,
      dp: spec.dp,
      signed: spec.signed,
      asOf,
    };
  }
}

interface Observation {
  date: string;
  value: string;
}

/** Observations for any series/transform, newest first. */
async function observations(seriesId: string, units: string, limit: number): Promise<Observation[]> {
  const k = key();
  if (!k) return [];
  const json = await getJson<{ observations?: Observation[] }>(
    `/series/observations?series_id=${seriesId}&units=${units}` +
      `&sort_order=desc&limit=${limit}&api_key=${k}&file_type=json`,
  );
  return (json?.observations ?? []).filter((o) => o.value !== ".");
}

/**
 * Deterministic context for one release — the second line, under the surprise.
 *
 * Per series, because one formula fits four of the eight and is wrong for the
 * rest: an annualized rate off a weekly claims count is meaningless, and a 3-month
 * annualized rate off an NSA index is seasonality rather than signal. The `kind`
 * on each spec decides which reading applies.
 *
 * At most one entry per release. Two numbers under a surprise is a paragraph, not
 * a note.
 */
async function buildContext(spec: ReleaseSpec): Promise<MacroContext[]> {
  const kind = spec.contextKind ?? "none";
  if (kind === "none") return [];

  try {
    // Claims: FRED publishes the four-week average directly as IC4WSA, and the
    // published figure is the one every desk quotes. Computing our own would be a
    // different number with the same name.
    if (kind === "publishedAverage" && spec.contextSeriesId) {
      const obs = await observations(spec.contextSeriesId, "lin", 1);
      if (obs.length === 0) return [];
      const v = Number(obs[0].value) * (spec.scale ?? 1);
      if (!Number.isFinite(v)) return [];
      return [{
        kind: "publishedAverage",
        value: Math.round(v * 10 ** spec.dp) / 10 ** spec.dp,
        windowPeriods: 4,
        seriesId: spec.contextSeriesId,
        inputPeriods: [obs[0].date],
      }];
    }

    // Price indices: the 3-month annualized rate, from the SEASONALLY ADJUSTED
    // twin. Off an NSA series this figure is seasonality — which is exactly why
    // the headline y/y is correct on NSA and this is not.
    if (kind === "index") {
      const series = spec.contextSeriesId ?? spec.seriesId;
      const obs = await observations(series, "lin", 4);
      if (obs.length < 4) return [];
      const latest = Number(obs[0].value);
      const threeAgo = Number(obs[3].value);
      if (!Number.isFinite(latest) || !Number.isFinite(threeAgo) || threeAgo <= 0) return [];
      const annualized = ((latest / threeAgo) ** 4 - 1) * 100;
      return [{
        kind: "annualized",
        value: Math.round(annualized * 10) / 10,
        windowPeriods: 3,
        seriesId: series,
        inputPeriods: [obs[3].date, obs[0].date],
      }];
    }

    // Payrolls: the three-month average monthly change, which is how the number
    // is read once a single month's noise is set aside.
    if (kind === "count") {
      const obs = await observations(spec.seriesId, spec.units, 3);
      if (obs.length < 3) return [];
      const vals = obs.map((o) => Number(o.value) * (spec.scale ?? 1));
      if (vals.some((v) => !Number.isFinite(v))) return [];
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return [{
        kind: "average",
        value: Math.round(avg * 10 ** spec.dp) / 10 ** spec.dp,
        windowPeriods: 3,
        seriesId: spec.seriesId,
        inputPeriods: obs.map((o) => o.date).reverse(),
      }];
    }

    // Retail sales: the three-month average m/m. NOT annualized — the annualized
    // form of a noisy monthly retail print reads as a trend it cannot support.
    if (kind === "average") {
      const obs = await observations(spec.seriesId, spec.units, 3);
      if (obs.length < 3) return [];
      const vals = obs.map((o) => Number(o.value));
      if (vals.some((v) => !Number.isFinite(v))) return [];
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return [{
        kind: "average",
        value: Math.round(avg * 10) / 10,
        windowPeriods: 3,
        seriesId: spec.seriesId,
        inputPeriods: obs.map((o) => o.date).reverse(),
      }];
    }

    // Unemployment: a level, so the useful context is where it sat three months
    // ago. An annualized rate of a rate is nonsense.
    if (kind === "rate") {
      const obs = await observations(spec.seriesId, "lin", 4);
      if (obs.length < 4) return [];
      const now = Number(obs[0].value);
      const then = Number(obs[3].value);
      if (!Number.isFinite(now) || !Number.isFinite(then)) return [];
      return [{
        kind: "levelChange",
        value: Math.round((now - then) * 10) / 10,
        windowPeriods: 3,
        seriesId: spec.seriesId,
        inputPeriods: [obs[3].date, obs[0].date],
      }];
    }
  } catch (error) {
    logger.warn(SRC, "Release context unavailable", { label: spec.label, error });
  }
  return [];
}

/** Twelve-month low/high of the headline transform, plus the last print. */
async function twelveMonthRange(
  spec: ReleaseSpec,
): Promise<{ last: number; low: number; high: number } | null> {
  // Weekly series need ~52 observations to span a year; monthly need 12.
  const limit = spec.seriesId === "ICSA" ? 52 : 13;
  const obs = await observations(spec.seriesId, spec.units, limit);
  if (obs.length < 6) return null;
  const vals = obs.map((o) => Number(o.value) * (spec.scale ?? 1)).filter((v) => Number.isFinite(v));
  if (vals.length < 6) return null;
  const r = (n: number) => Math.round(n * 10 ** spec.dp) / 10 ** spec.dp;
  return { last: r(vals[0]), low: r(Math.min(...vals)), high: r(Math.max(...vals)) };
}

/** Latest two observations for a spec, transformed by FRED itself. */
async function latestTwo(spec: ReleaseSpec): Promise<Observation[]> {
  const k = key();
  if (!k) return [];
  const json = await getJson<{ observations?: Observation[] }>(
    `/series/observations?series_id=${spec.seriesId}&units=${spec.units}` +
      `&sort_order=desc&limit=4&api_key=${k}&file_type=json`,
  );
  return (json?.observations ?? []).filter((o) => o.value !== ".");
}

/**
 * Has the prior period been revised since it was first published?
 *
 * FRED cannot apply a `units` transform across vintages — asking for one returns
 * 400, which silently dropped payrolls and CPI on the first run. A transform
 * needs neighbouring observations, and those differ per vintage, so this is a
 * real API limit rather than a parameter mistake.
 *
 * So the prior is quoted from the CURRENT vintage (the spec's other sanctioned
 * option) and this flags whether the underlying level has since been revised —
 * checked on the untransformed series, where vintages are permitted. The label
 * then says "prior revised", which is honest: a revision is often larger than
 * the surprise being reported, and hiding it would be the misleading choice.
 */
async function priorWasRevised(spec: ReleaseSpec, priorPeriod: string): Promise<boolean> {
  const k = key();
  if (!k) return false;
  const json = await getJson<{ observations?: Observation[] }>(
    `/series/observations?series_id=${spec.seriesId}` +
      `&observation_start=${priorPeriod}&observation_end=${priorPeriod}` +
      `&realtime_start=1776-07-04&realtime_end=9999-12-31&api_key=${k}&file_type=json`,
  );
  const vintages = (json?.observations ?? []).filter((o) => o.value !== ".");
  if (vintages.length < 2) return false;
  const first = Number(vintages[0].value);
  const current = Number(vintages[vintages.length - 1].value);
  return Number.isFinite(first) && Number.isFinite(current) && Math.abs(current - first) > 1e-9;
}

/**
 * Releases that PRINTED on `marketDate`, each with its actual and the prior as
 * originally published.
 *
 * An EMPTY value and null are different answers and the archive page renders
 * them as different sentences. Empty means FRED was reached and no whitelisted
 * release was dated that session — a quiet calendar, which is most sessions.
 * Null means we could not ask, or a release was dated but its figure was not
 * yet ingested, and the page then says the calendar is unavailable rather than
 * asserting that nothing printed.
 */
export async function fetchMacroReleases(
  marketDate: string,
  asOf: string,
): Promise<{ fact: Fact<MacroRelease[]> | null; health: ConnectorHealth[] }> {
  const health: ConnectorHealth[] = [];
  if (!key()) {
    logger.info(SRC, "FRED_API_KEY not set — macro releases omitted");
    health.push({ name: "FRED releases", status: "down", detail: "FRED_API_KEY not set" });
    health.push({ name: "Nasdaq consensus", status: "skipped", detail: "no releases to match" });
    return { fact: null, health };
  }

  const { answered, byRelease } = await releaseDatesIn(marketDate, marketDate, marketDate);
  if (!answered) {
    health.push({ name: "FRED releases", status: "down", detail: "no answer from the release calendar" });
    health.push({ name: "Nasdaq consensus", status: "skipped", detail: "FRED releases was down" });
    return { fact: null, health };
  }
  if (byRelease.size === 0) {
    logger.info(SRC, "No tracked release was dated this session", { marketDate });
    health.push({ name: "FRED releases", status: "empty", detail: "no tracked release dated today" });
    health.push({ name: "Nasdaq consensus", status: "skipped", detail: "no releases printed today" });
    // A reached-but-quiet calendar is a FACT the page states; only an unreachable
    // one is null. The two render as different sentences.
    return { fact: { value: [], source: SOURCE_RELEASES(false), asOf }, health };
  }

  // One calendar fetch for the whole session, before the loop. `rows === null`
  // means the endpoint never answered, which is a different state from answering
  // with nothing — the health record has to tell those apart.
  const scheduled = RELEASES.filter((s) => byRelease.has(s.releaseId) && s.nasdaqEventName);
  const consensusFetch = scheduled.length > 0 ? await fetchConsensus(marketDate) : null;
  let matched = 0;

  const out: MacroRelease[] = [];
  for (const spec of RELEASES) {
    if (!byRelease.has(spec.releaseId)) continue;
    const obs = await latestTwo(spec);
    if (obs.length < 2) continue;

    const sc = spec.scale ?? 1;
    const actual = Number(obs[0].value) * sc;
    const prior = Number(obs[1].value) * sc;
    if (!Number.isFinite(actual) || !Number.isFinite(prior)) continue;

    // Staleness gate. FRED's calendar says the release happened today, but if
    // FRED has not yet ingested the figure, the latest observation is still LAST
    // period's — and printing that would present weeks-old data as today's news,
    // which is precisely the failure this section exists to avoid.
    const ageDays = (Date.parse(`${marketDate}T00:00:00Z`) - Date.parse(`${obs[0].date}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(ageDays) || ageDays > spec.maxAgeDays) {
      logger.warn(SRC, "Release scheduled today but latest observation is stale — omitting", {
        label: spec.label,
        latestPeriod: obs[0].date,
        ageDays: Math.round(ageDays),
        maxAgeDays: spec.maxAgeDays,
      });
      continue;
    }
    const priorRevised = await priorWasRevised(spec, obs[1].date);
    const roundedActual = Math.round(actual * 10 ** spec.dp) / 10 ** spec.dp;
    const roundedPrior = Math.round(prior * 10 ** spec.dp) / 10 ** spec.dp;

    // The join: unique match on the prior, never first-match-wins. Compared at
    // this spec's own display precision and AFTER its scale, so ICSA's "200K"
    // meets FRED's 200,000 as 200 against 200.
    let consensus: number | undefined;
    let surprise: number | undefined;
    if (spec.nasdaqEventName && consensusFetch?.rows) {
      const row = matchRow(consensusFetch.rows, spec.nasdaqEventName, roundedPrior, spec.dp);
      if (row) {
        matched++;
        if (row.consensus != null) {
          consensus = row.consensus;
          surprise = Math.round((roundedActual - row.consensus) * 10 ** spec.dp) / 10 ** spec.dp;
        }
      }
    }

    out.push({
      label: spec.label,
      period: obs[0].date,
      timeEt: spec.timeEt,
      actual: roundedActual,
      prior: roundedPrior,
      priorRevised,
      suffix: spec.suffix,
      dp: spec.dp,
      signed: spec.signed,
      consensus,
      surprise,
      consensusAsOf: consensus != null ? asOf : undefined,
      context: await buildContext(spec),
    });
  }

  if (consensusFetch) {
    health.push(consensusHealth(consensusFetch, scheduled.length, matched));
  } else {
    health.push({ name: "Nasdaq consensus", status: "skipped", detail: "no consensus-carrying release today" });
  }

  if (out.length === 0) {
    health.push({ name: "FRED releases", status: "degraded", detail: "releases were scheduled but none resolved" });
    return { fact: null, health };
  }
  health.push({
    name: "FRED releases",
    status: "ok",
    itemsExpected: Array.from(byRelease.keys()).length,
    itemsGot: out.length,
  });
  logger.info(SRC, "Macro releases printed today", {
    count: out.length,
    labels: out.map((o) => o.label),
    withConsensus: out.filter((o) => o.consensus != null).length,
  });
  return { fact: { value: out, source: SOURCE_RELEASES(out.some((o) => o.consensus != null)), asOf }, health };
}

