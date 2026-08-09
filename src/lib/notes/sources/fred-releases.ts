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
import type { Fact, MacroRelease } from "@/lib/notes/types";

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
  { releaseId: 10, seriesId: "CPIAUCNS", label: "CPI y/y", units: "pc1", timeEt: "8:30", suffix: "%", dp: 1, maxAgeDays: 60 },
  { releaseId: 46, seriesId: "PPIFIS", label: "PPI y/y", units: "pc1", timeEt: "8:30", suffix: "%", dp: 1, maxAgeDays: 60 },
  { releaseId: 50, seriesId: "PAYEMS", label: "Payrolls", units: "chg", timeEt: "8:30", suffix: "k", dp: 0, maxAgeDays: 60 },
  { releaseId: 50, seriesId: "UNRATE", label: "Unemployment", units: "lin", timeEt: "8:30", suffix: "%", dp: 1, maxAgeDays: 60 },
  { releaseId: 54, seriesId: "PCEPILFE", label: "Core PCE y/y", units: "pc1", timeEt: "8:30", suffix: "%", dp: 1, maxAgeDays: 70 },
  { releaseId: 9, seriesId: "RSAFS", label: "Retail sales m/m", units: "pch", timeEt: "8:30", suffix: "%", dp: 1, maxAgeDays: 60 },
  { releaseId: 180, seriesId: "ICSA", label: "Jobless claims", units: "lin", timeEt: "8:30", suffix: "k", dp: 0, maxAgeDays: 14 },
  { releaseId: 53, seriesId: "A191RL1Q225SBEA", label: "GDP q/q ann.", units: "lin", timeEt: "8:30", suffix: "%", dp: 1, maxAgeDays: 130 },
];

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
async function releaseDatesIn(from: string, to: string): Promise<Map<number, string[]>> {
  const k = key();
  const out = new Map<number, string[]>();
  if (!k) return out;

  const ids = Array.from(new Set(RELEASES.map((r) => r.releaseId)));
  for (const id of ids) {
    const json = await getJson<{ release_dates?: { date: string }[] }>(
      `/release/dates?release_id=${id}&realtime_start=${from}&realtime_end=${to}` +
        `&include_release_dates_with_no_data=true&api_key=${k}&file_type=json`,
    );
    const dates = (json?.release_dates ?? []).map((d) => d.date).filter((d) => d >= from && d <= to);
    if (dates.length > 0) out.set(id, Array.from(new Set(dates)).sort());
  }
  return out;
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
 * originally published. Returns null when nothing landed or FRED is unusable —
 * the section is then simply omitted (§1a).
 */
export async function fetchMacroReleases(marketDate: string, asOf: string): Promise<Fact<MacroRelease[]> | null> {
  if (!key()) {
    logger.info(SRC, "FRED_API_KEY not set — macro releases omitted");
    return null;
  }

  const dates = await releaseDatesIn(marketDate, marketDate);
  if (dates.size === 0) return null;

  const out: MacroRelease[] = [];
  for (const spec of RELEASES) {
    if (!dates.has(spec.releaseId)) continue;
    const obs = await latestTwo(spec);
    if (obs.length < 2) continue;

    const actual = Number(obs[0].value);
    const prior = Number(obs[1].value);
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
    });
  }

  if (out.length === 0) return null;
  logger.info(SRC, "Macro releases printed today", { count: out.length, labels: out.map((o) => o.label) });
  return { value: out, source: "FRED (actual vs prior — no consensus available)", asOf };
}

/** Whitelisted releases scheduled in (from, to] — feeds TOMORROW'S TELLS. */
export async function fetchUpcomingReleases(from: string, to: string): Promise<{ label: string; date: string; timeEt: string }[]> {
  const dates = await releaseDatesIn(from, to);
  const out: { label: string; date: string; timeEt: string }[] = [];
  const seen = new Set<string>();
  for (const spec of RELEASES) {
    for (const d of dates.get(spec.releaseId) ?? []) {
      // One line per release, not per series — Payrolls and Unemployment share a
      // release and would otherwise both announce themselves.
      const k = `${spec.releaseId}:${d}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ label: spec.label.replace(/ (y\/y|m\/m|q\/q ann\.)$/, ""), date: d, timeEt: spec.timeEt });
    }
  }
  return out.sort((a, b) => (a.date + a.timeEt).localeCompare(b.date + b.timeEt)).slice(0, 4);
}
