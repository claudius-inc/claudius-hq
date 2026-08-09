/**
 * Expectation memory — see docs/daily-note-v2-spec.md §F.
 *
 * A storable expectation is falsifiable and pre-registered: subject, metric,
 * comparator, threshold, horizon, and the baseline at creation. Prose is never
 * parsed for predictions — "narrow leadership dressed as strength" cannot be
 * scored, and pretending otherwise only produces grading ambiguity.
 *
 * Two design choices carry most of the honesty:
 *
 *  1. **Horizons count EXCHANGE sessions, not pipeline runs.** Counting runs
 *     looked elegant (a holiday consumes no horizon) but conflates "no session"
 *     with "we were down". A three-day outage would hand every open bet three
 *     extra days AND destroy genuine hits, because a touch test only sees the
 *     closes it was awake for. Those errors point in opposite directions, which
 *     is worse than a bias — it is noise wearing a ledger's clothes. So sessions
 *     are counted from the exchange's own bars and missed closes are backfilled.
 *
 *  2. **Resolution fetches its own subjects.** Reading tonight's note facts
 *     would only ever cover the benchmarks and whichever names happened to
 *     surface that day, so a name flagged on Monday would sit unresolved until
 *     it expired — attrition would then dominate exactly the most interesting
 *     bets.
 */
import YahooFinance from "yahoo-finance2";
import { and, eq, inArray } from "drizzle-orm";
import { db, noteExpectations } from "@/db";
import { logger } from "@/lib/logger";
import { acquireYahooSlot } from "@/lib/scanner/yahoo-rate-limiter";
import { etDate } from "@/lib/notes/session";
import type { StructuredFacts } from "@/lib/notes/types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/expectations";

/** Grace after the horizon before a still-undecided row is written off. */
const GRACE_SESSIONS = 2;

export interface ResolvedExpectation {
  id: number;
  subject: string;
  threshold: number;
  comparator: string;
  noteDate: string;
  status: "hit" | "miss";
  resolvedValue: number;
}

/**
 * Closes for a symbol on or after `fromDate`, keyed by ET date. Backfills the
 * sessions a pipeline outage would otherwise have skipped.
 */
async function closesSince(symbol: string, fromDate: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    await acquireYahooSlot();
    const chart = (await yahooFinance.chart(symbol, {
      period1: new Date(`${fromDate}T00:00:00Z`),
      interval: "1d",
    })) as { quotes?: { date?: Date; close?: number | null }[] };
    for (const q of chart?.quotes ?? []) {
      if (q?.date == null || q.close == null || !Number.isFinite(q.close)) continue;
      out.set(etDate(q.date.getTime()), q.close);
    }
  } catch (error) {
    logger.warn(SRC, "Close history fetch failed", { symbol, error });
  }
  return out;
}

/** True when `value` satisfies the comparator against the threshold. */
function satisfied(comparator: string, value: number, threshold: number): boolean {
  switch (comparator) {
    case "touch_above":
    case "at_horizon_above":
      return value > threshold;
    case "touch_below":
    case "at_horizon_below":
      return value < threshold;
    default:
      return false;
  }
}

/**
 * Resolve every open expectation against real closes. Returns the ones that
 * settled TODAY, which is all the note is allowed to mention.
 */
export async function resolveExpectations(marketDate: string, facts: StructuredFacts): Promise<ResolvedExpectation[]> {
  const open = await db.select().from(noteExpectations).where(eq(noteExpectations.status, "open"));
  // Nothing left open still needs the settled-today query: the evening's second
  // run finds every row already closed, and returning [] here would strip the
  // ledger line out of the edited message.
  if (open.length === 0) return settledOn(marketDate);

  // Sessions are counted from the index's own bars, so an outage cannot silently
  // extend a horizon and a delisted or halted subject still expires normally.
  const oldest = open.reduce((min, r) => (r.noteDate < min ? r.noteDate : min), open[0].noteDate);
  const sessionBars = await closesSince("^GSPC", oldest);
  const sessionDates = Array.from(sessionBars.keys()).sort();

  const resolvedToday: ResolvedExpectation[] = [];
  const subjects = Array.from(new Set(open.map((r) => r.subject)));
  const closesBySubject = new Map<string, Map<string, number>>();
  for (const s of subjects) {
    // Derived metrics are not price series; they resolve from tonight's facts.
    if (s.startsWith("SPREAD_")) continue;
    closesBySubject.set(s, await closesSince(s, oldest));
  }

  for (const row of open) {
    // Sessions strictly after the registering day, capped at the horizon. The
    // cap is load-bearing: without it a touch during the grace window — or after
    // an outage — still settles as a hit, so hits would get unlimited extra time
    // while misses were graded exactly on schedule. That asymmetry is
    // self-flattery, and it lives in the grader's clock rather than in who may
    // write, which is why the immutability rules alone do not catch it.
    const after = sessionDates.filter((d) => d > row.noteDate && d <= marketDate);
    const elapsed = after.length;
    const withinHorizon = after.slice(0, row.horizonSessions);
    const touch = row.comparator.startsWith("touch_");
    const isSpread = row.subject.startsWith("SPREAD_");

    let decided: { value: number; date: string; status: "hit" | "miss" } | null = null;

    if (isSpread) {
      // A derived metric has no history to backfill, so it can only ever be read
      // on a session we actually observed. `elapsed > 0` keeps a bet registered
      // earlier this evening from resolving against its own baseline when the
      // workflow fires its second run.
      const v = facts.rates?.value.spread2s10Bp;
      if (v != null && elapsed > 0) {
        if (touch && satisfied(row.comparator, v, row.threshold)) {
          decided = { value: v, date: marketDate, status: "hit" };
        } else if (!touch && elapsed >= row.horizonSessions) {
          // At-horizon settles either way — a failed state IS a decision.
          decided = {
            value: v,
            date: marketDate,
            status: satisfied(row.comparator, v, row.threshold) ? "hit" : "miss",
          };
        }
      }
    } else {
      const closes = closesBySubject.get(row.subject);
      if (closes) {
        if (touch) {
          for (const d of withinHorizon) {
            const v = closes.get(d);
            if (v != null && satisfied(row.comparator, v, row.threshold)) {
              decided = { value: v, date: d, status: "hit" };
              break;
            }
          }
          // Never touched, and the horizon is spent. Every close is backfilled,
          // so this is genuinely decidable — settling it as unresolvable would
          // launder a loser into attrition.
          if (!decided && elapsed >= row.horizonSessions && withinHorizon.length > 0) {
            const last = withinHorizon[withinHorizon.length - 1];
            decided = { value: closes.get(last) ?? row.baselineValue, date: last, status: "miss" };
          }
        } else if (elapsed >= row.horizonSessions) {
          // Grade the HORIZON session, not the latest one — after an outage
          // those differ, and the horizon close is already backfilled.
          const at = withinHorizon[row.horizonSessions - 1];
          const v = at ? closes.get(at) : undefined;
          if (v != null) {
            decided = { value: v, date: at, status: satisfied(row.comparator, v, row.threshold) ? "hit" : "miss" };
          }
        }
      }
    }

    if (decided) {
      await settle(row.id, decided.status, decided.value, decided.date, elapsed, isSpread, marketDate);
      resolvedToday.push({
        id: row.id,
        subject: row.subject,
        threshold: row.threshold,
        comparator: row.comparator,
        noteDate: row.noteDate,
        status: decided.status,
        resolvedValue: decided.value,
      });
      continue;
    }

    if (elapsed >= row.horizonSessions + GRACE_SESSIONS) {
      // Out of time with no decision — the deciding data never arrived. It
      // stays in every denominator as attrition rather than disappearing.
      await db
        .update(noteExpectations)
        .set({ status: "unresolvable", sessionsElapsed: elapsed, resolvedDate: marketDate })
        .where(eq(noteExpectations.id, row.id));
      continue;
    }

    await db.update(noteExpectations).set({ sessionsElapsed: elapsed }).where(eq(noteExpectations.id, row.id));
  }

  logger.info(SRC, "Expectations resolved", { open: open.length, settledThisRun: resolvedToday.length });
  // Return everything that settled TODAY, not just what this process settled.
  // The workflow fires twice an evening; the second run finds those rows already
  // closed, and returning only its own work would silently strip the ledger line
  // out of the edited message.
  return settledOn(marketDate);
}

/** Every expectation that reached a terminal state on `marketDate`. */
export async function settledOn(marketDate: string): Promise<ResolvedExpectation[]> {
  const rows = await db
    .select()
    .from(noteExpectations)
    .where(and(eq(noteExpectations.settledAt, marketDate), inArray(noteExpectations.status, ["hit", "miss"])));
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    threshold: r.threshold,
    comparator: r.comparator,
    noteDate: r.noteDate,
    status: r.status as "hit" | "miss",
    resolvedValue: r.resolvedValue ?? r.baselineValue,
  }));
}

/**
 * Write the terminal state. Guarded on `status = "open"` so a row can only ever
 * settle once — a bet that has already resolved must never be re-graded.
 */
async function settle(
  id: number,
  status: "hit" | "miss",
  value: number,
  date: string,
  sessionsElapsed: number,
  isSpread: boolean,
  gradedOn: string,
) {
  await db
    .update(noteExpectations)
    .set({
      status,
      resolvedValue: value,
      resolvedDate: date,
      // Provenance must match what was actually read: a derived spread is not a
      // Yahoo close, and mislabelling it would misstate how the bet was graded.
      resolvedSource: isSpread ? "US Treasury curve (assembled facts)" : "Yahoo daily close",
      settledAt: gradedOn,
      sessionsElapsed,
    })
    .where(and(eq(noteExpectations.id, id), eq(noteExpectations.status, "open")));
}

/** How many bets are still live — printed so a hit is never shown without context. */
export async function countOpen(): Promise<number> {
  const rows = await db
    .select({ id: noteExpectations.id })
    .from(noteExpectations)
    .where(inArray(noteExpectations.status, ["open"]));
  return rows.length;
}
