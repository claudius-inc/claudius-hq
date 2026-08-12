/**
 * Economic releases — see docs/daily-note-v2-spec.md §E.
 *
 * FRED's release calendar is free and answers "what lands today, and this week".
 * It does NOT carry consensus: both FMP's and Finnhub's economic calendars are
 * paywalled, so the note reports each print against its **prior**, and says so.
 * A surprise against the prior is real information; calling it a consensus miss
 * would not be true.
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
import type { Fact, MacroRelease, EconEvent } from "@/lib/notes/types";

const SRC = "notes/fred-releases";
const BASE = "https://api.stlouisfed.org/fred";

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
}

/** The releases a market reader actually positions around. */
const RELEASES: ReleaseSpec[] = [
  { releaseId: 10, seriesId: "CPIAUCNS", label: "CPI y/y", units: "pc1", timeEt: "8:30", suffix: "%", dp: 1, signed: false, maxAgeDays: 60 },
  { releaseId: 46, seriesId: "PPIFID", label: "PPI y/y", units: "pc1", timeEt: "8:30", suffix: "%", dp: 1, signed: false, maxAgeDays: 60 },
  { releaseId: 50, seriesId: "PAYEMS", label: "Payrolls", units: "chg", timeEt: "8:30", suffix: "k", dp: 0, signed: true, maxAgeDays: 60 },
  { releaseId: 50, seriesId: "UNRATE", label: "Unemployment", units: "lin", timeEt: "8:30", suffix: "%", dp: 1, signed: false, maxAgeDays: 60 },
  { releaseId: 54, seriesId: "PCEPILFE", label: "Core PCE y/y", units: "pc1", timeEt: "8:30", suffix: "%", dp: 1, signed: false, maxAgeDays: 70 },
  { releaseId: 9, seriesId: "RSAFS", label: "Retail sales m/m", units: "pch", timeEt: "8:30", suffix: "%", dp: 1, signed: true, maxAgeDays: 60 },
  { releaseId: 180, seriesId: "ICSA", label: "Jobless claims", units: "lin", timeEt: "8:30", suffix: "k", dp: 0, scale: 1e-3, signed: false, maxAgeDays: 8 },
  { releaseId: 53, seriesId: "A191RL1Q225SBEA", label: "GDP q/q ann. (advance)", units: "lin", timeEt: "8:30", suffix: "%", dp: 1, signed: true, maxAgeDays: 130 },
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
 * It is EMPTY on purpose. Guessing meeting dates would be exactly the
 * fabrication §1a forbids, and a wrong FOMC date is the most damaging single
 * error this note could make. Paste the real dates from
 * https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm to switch the
 * section on; the rendering path below already handles them.
 *
 * Framed as an EVENT, never as actual-vs-prior: the target rate is unchanged at
 * all but a handful of observations a year, and the content that matters —
 * statement, projections — is not a FRED series at all.
 */
const FOMC_DECISIONS: { date: string; timeEt: string }[] = [];

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
 * The one thing it cannot answer is CONSENSUS, and per §I that is settled
 * rather than pending: the note announces the event and its time, and says
 * nothing about what the street expects. An announcement with no number is
 * honest and useful; a consensus we cannot source would be neither.
 */
export async function fetchUpcomingReleases(
  from: string,
  to: string,
  today: string,
  asOf: string,
): Promise<Fact<EconEvent[]> | null> {
  if (!key()) {
    logger.info(SRC, "FRED_API_KEY not set — upcoming releases omitted");
    return null;
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
    if (m.date >= from && m.date <= to) events.push({ name: "FOMC decision", date: m.date, timeEt: m.timeEt });
  }

  // "FRED answered and the week ahead is empty" is a FACT the reader can use;
  // "we never reached FRED" is not. Only the second is null — see `Absent`,
  // which renders a different sentence for each.
  if (events.length === 0) {
    if (!answered) return null;
    return { value: [], source: "FRED release calendar (no consensus available)", asOf };
  }
  events.sort((a, b) => (a.date + a.timeEt).localeCompare(b.date + b.timeEt));
  logger.info(SRC, "Upcoming releases loaded", { count: events.length, from, to });
  return { value: events.slice(0, 4), source: "FRED release calendar (no consensus available)", asOf };
}

interface Observation {
  date: string;
  value: string;
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
export async function fetchMacroReleases(marketDate: string, asOf: string): Promise<Fact<MacroRelease[]> | null> {
  if (!key()) {
    logger.info(SRC, "FRED_API_KEY not set — macro releases omitted");
    return null;
  }

  const { answered, byRelease } = await releaseDatesIn(marketDate, marketDate, marketDate);
  if (!answered) return null;
  if (byRelease.size === 0) {
    logger.info(SRC, "No tracked release was dated this session", { marketDate });
    return { value: [], source: "FRED (actual vs prior — no consensus available)", asOf };
  }

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

    out.push({
      label: spec.label,
      period: obs[0].date,
      timeEt: spec.timeEt,
      actual: Math.round(actual * 10 ** spec.dp) / 10 ** spec.dp,
      prior: Math.round(prior * 10 ** spec.dp) / 10 ** spec.dp,
      priorRevised,
      suffix: spec.suffix,
      dp: spec.dp,
      signed: spec.signed,
    });
  }

  if (out.length === 0) return null;
  logger.info(SRC, "Macro releases printed today", { count: out.length, labels: out.map((o) => o.label) });
  return { value: out, source: "FRED (actual vs prior — no consensus available)", asOf };
}

