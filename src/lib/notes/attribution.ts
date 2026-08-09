/**
 * Why a stock moved — see docs/daily-note-v2-spec.md §B and §1b.
 *
 * §1b: causes never originate from the LLM. A reason is retrieved, dated and
 * direction-checked, or it is not printed — and it is printed by the RENDERER.
 * This module composes the phrase; the model never carries one.
 *
 * Two rules do most of the work:
 *
 *  1. **Two verbs, chosen deterministically.** "on" is causal and is allowed
 *     only when a SIGNED event matches the move's direction (a downgrade with a
 *     fall). "after" is temporal and direction-neutral, and is what earnings
 *     get — because stocks fall on good numbers. AKAM is the case in point: it
 *     beat by a cent on one source's estimate and fell 6.8%, while the same
 *     day's analyst actions were mixed. "After reporting" is true there;
 *     "on a downgrade" would have been false.
 *
 *  2. **Beat/miss needs two sources to agree on the sign.** Yahoo and Finnhub
 *     put AKAM's estimate at 1.57684 and 1.6052 against the same 1.59 actual —
 *     a beat by one, a miss by the other. Where reputable feeds contradict each
 *     other we do not get to pick the flattering one, so the clause states the
 *     actual and stops.
 */
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";
import { acquireYahooSlot } from "@/lib/scanner/yahoo-rate-limiter";
import { etDate } from "@/lib/notes/session";
import { placeEarnings, isReactionDay, toMs } from "@/lib/notes/earnings-window";
import type { EarningsReport } from "@/lib/notes/sources/earnings-calendar";
import type { Attribution } from "@/lib/notes/types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/attribution";

/** A move must clear this in absolute terms before any reason is attached. */
const MIN_ABS_MOVE = 1.5;
/** …and this multiple of its sector's move, excluding itself. */
const MIN_SECTOR_MULTIPLE = 2;
/** Cap the per-ticker fetches; the note only names a handful. */
const MAX_CANDIDATES = 10;

export interface AttributionCandidate {
  ticker: string;
  changePct: number;
  sectorEtf: string;
  /** The sector ETF's own move. */
  sectorPct: number;
  /** Weight inside its sector SPDR, percent. Null disables the ex-subject maths. */
  sectorWeight: number | null;
  /** Yahoo's session-half placeholder. */
  earningsStamp: unknown;
}

/**
 * The sector's move EXCLUDING this name. A mega-cap is a large share of its own
 * sector ETF, so comparing it against the raw sector move asks it to beat
 * itself — and earnings attribution would fail for exactly the biggest
 * reporters. Weights are stored as percent, so convert to a fraction first;
 * using 24 where 0.24 belongs is catastrophic rather than merely inaccurate.
 */
function exSubjectSectorPct(c: AttributionCandidate): number | null {
  if (c.sectorWeight == null || !Number.isFinite(c.sectorWeight)) return null;
  const w = c.sectorWeight / 100;
  if (!(w > 0) || w >= 0.95) return null;
  return (c.sectorPct - w * c.changePct) / (1 - w);
}

interface RatingAction {
  firm: string;
  fromGrade?: string;
  toGrade?: string;
  action?: string;
  epochGradeDate?: unknown;
  priorPriceTarget?: number;
  currentPriceTarget?: number;
}

/**
 * Analyst actions that could have moved TODAY's regular session.
 *
 * The window closes at the bell, not at midnight. The note runs at 6:15pm, so a
 * calendar-day filter sweeps in actions issued after the close — and printing
 * "fell on a downgrade" for a downgrade published hours AFTER the fall is a
 * cause that post-dates its effect. Those belong to tomorrow's reaction day.
 */
async function fetchRatingActions(
  ticker: string,
  marketDate: string,
  closeMinute: number,
): Promise<RatingAction[]> {
  try {
    await acquireYahooSlot();
    const s = (await yahooFinance.quoteSummary(ticker, {
      modules: ["upgradeDowngradeHistory"],
    })) as { upgradeDowngradeHistory?: { history?: RatingAction[] } };
    const hist = s.upgradeDowngradeHistory?.history ?? [];
    return hist.filter((h) => {
      const ms = toMs(h.epochGradeDate);
      if (!Number.isFinite(ms) || ms <= 0 || etDate(ms) !== marketDate) return false;
      return etMinutesOf(ms) <= closeMinute;
    });
  } catch (error) {
    logger.warn(SRC, "Rating fetch failed", { ticker, error });
    return [];
  }
}

/** Yahoo's own consensus for the most recent completed quarter. */
async function fetchYahooEps(ticker: string): Promise<{ actual: number; estimate: number } | null> {
  try {
    await acquireYahooSlot();
    const s = (await yahooFinance.quoteSummary(ticker, { modules: ["earningsHistory"] })) as {
      earningsHistory?: { history?: { epsActual?: number; epsEstimate?: number }[] };
    };
    const h = s.earningsHistory?.history ?? [];
    const last = h[h.length - 1];
    if (last?.epsActual == null || last?.epsEstimate == null) return null;
    return { actual: last.epsActual, estimate: last.epsEstimate };
  } catch {
    return null;
  }
}

/** Minutes-since-ET-midnight for an instant. */
function etMinutesOf(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (h % 24) * 60 + m;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Build attributions for the candidates that clear the gate. Every phrase
 * CONTAINS its own ticker, which is what lets the prose rule be a simple
 * containment check.
 */
export async function buildAttributions(
  candidates: AttributionCandidate[],
  earningsCal: Map<string, EarningsReport>,
  marketDate: string,
  priorSessionDate: string | null,
  closeMinute: number,
): Promise<Attribution[]> {
  const out: Attribution[] = [];
  const shortlist = candidates
    .filter((c) => Math.abs(c.changePct) >= MIN_ABS_MOVE)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, MAX_CANDIDATES);

  for (const c of shortlist) {
    // Finnhub's explicit bmo/amc is authoritative; the Yahoo stamp is the
    // fallback when the calendar is unavailable or leaves `hour` blank.
    const report = earningsCal.get(c.ticker);
    let reactionDay = false;
    if (report?.half) {
      reactionDay =
        (report.half === "bmo" && report.date === marketDate) ||
        (report.half === "amc" && priorSessionDate != null && report.date === priorSessionDate);
    } else {
      reactionDay = isReactionDay(
        placeEarnings({ stamp: c.earningsStamp, marketDate, priorSessionDate, closeMinute }),
      );
    }

    // The relative leg is waived when earnings corroborate: reporting on the
    // reaction day is strong enough evidence to stand on the absolute floor.
    if (!reactionDay) {
      const exSector = exSubjectSectorPct(c);
      if (exSector == null) continue;
      if (Math.abs(c.changePct) < MIN_SECTOR_MULTIPLE * Math.abs(exSector)) continue;
    }

    const dir = c.changePct >= 0 ? "rose" : "fell";

    // ── Rung 1: earnings on the reaction day ────────────────────────────────
    if (reactionDay) {
      const yahoo = await fetchYahooEps(c.ticker);
      const finnhubActual = report?.epsActual ?? null;
      const actual = yahoo?.actual ?? finnhubActual;
      if (actual == null) {
        // A schedule is not a confirmation. Both paths here are calendars, and
        // a before-open report would be in the feeds by evening — a null actual
        // most likely means the report was postponed. §1a: print the move with
        // NO clause rather than assert a report we cannot confirm.
        logger.info(SRC, "Reported-today flagged but no actual to corroborate — no attribution", {
          ticker: c.ticker,
        });
        continue;
      }

      // Beat/miss only when both sources agree on the SIGN of the surprise.
      const ySign = yahoo ? Math.sign(yahoo.actual - yahoo.estimate) : null;
      const fSign =
        report?.epsEstimate != null && finnhubActual != null
          ? Math.sign(finnhubActual - report.epsEstimate)
          : null;
      const agreed = ySign != null && fSign != null && ySign === fSign && ySign !== 0;
      const verdict = agreed ? (ySign > 0 ? ", a beat" : ", a miss") : "";
      const est = agreed && yahoo ? ` vs ${money(yahoo.estimate)} est` : "";

      out.push({
        ticker: c.ticker,
        rung: "earnings",
        verb: "after",
        phrase: `${c.ticker} ${dir} ${fmtPct(c.changePct)} after reporting EPS ${money(actual)}${est}${verdict}`,
        epsActual: actual,
        epsEstimate: agreed && yahoo ? yahoo.estimate : undefined,
      });
      continue;
    }

    // ── Rungs 2 and 3: analyst actions dated today ──────────────────────────
    const actions = await fetchRatingActions(c.ticker, marketDate, closeMinute);
    const graded = actions.filter((a) => a.action === "up" || a.action === "down" || a.action === "init");
    const signed = graded.find(
      (a) => (a.action === "down" && c.changePct < 0) || (a.action === "up" && c.changePct > 0),
    );
    if (signed) {
      // "on" is licensed here: the event is signed and its direction matches.
      const word = signed.action === "down" ? "downgrade" : "upgrade";
      out.push({
        ticker: c.ticker,
        rung: "rating",
        verb: "on",
        phrase: `${c.ticker} ${dir} ${fmtPct(c.changePct)} on a ${signed.firm} ${word}`,
        firm: signed.firm,
      });
      continue;
    }
    // A direction MISMATCH drops the attribution; it never flips it.
    if (graded.length > 0) continue;

    const targets = actions.filter((a) => a.currentPriceTarget != null && a.priorPriceTarget != null);
    const sameWay = targets.filter(
      (a) =>
        Math.sign((a.currentPriceTarget as number) - (a.priorPriceTarget as number)) ===
        Math.sign(c.changePct),
    );
    // Only when the targets move as one — mixed revisions explain nothing.
    if (targets.length > 0 && sameWay.length === targets.length) {
      const word = c.changePct < 0 ? "target cuts" : "target raises";
      out.push({
        ticker: c.ticker,
        rung: "target",
        verb: "after",
        phrase: `${c.ticker} ${dir} ${fmtPct(c.changePct)} after ${targets.length} ${word}`,
      });
    }
  }

  logger.info(SRC, "Attributions built", {
    candidates: shortlist.length,
    attributed: out.length,
    byRung: out.reduce<Record<string, number>>((a, o) => ({ ...a, [o.rung]: (a[o.rung] ?? 0) + 1 }), {}),
  });
  return out;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}
