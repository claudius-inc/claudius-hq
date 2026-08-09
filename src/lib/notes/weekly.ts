/**
 * The weekly wrap — see docs/daily-note-v2-spec.md §C.
 *
 * Built from the daily notes the week actually produced, not re-derived. Those
 * rows exist only for sessions that passed the trading-session gate, so
 * `daily_notes.date` IS the trading calendar: a Good-Friday week simply ends on
 * Thursday, and a Monday holiday shifts the anchor without any holiday table.
 *
 * That construction is holiday-proof but NOT outage-proof — a missing week and a
 * holiday look identical to the query — so the anchor is range-checked, and a
 * span that is no longer a week is either labelled honestly or refused.
 */
import { and, desc, gte, lt, lte } from "drizzle-orm";
import { db, dailyNotes } from "@/db";
import { logger } from "@/lib/logger";
import type { StructuredFacts } from "@/lib/notes/types";

const SRC = "notes/weekly";

/** A start anchor older than this is not "last week" — the pipeline lost days. */
const MAX_ANCHOR_GAP_DAYS = 7;

export interface WeeklyAnchors {
  /** Last session of the week being wrapped. */
  weekEnd: string;
  /** The session the week is measured FROM (the last one before it). */
  weekStart: string;
  /** Every daily note inside the week, oldest first. */
  days: { date: string; facts: StructuredFacts }[];
  /** The anchor row's facts, used as the "from" side of every weekly change. */
  startFacts: StructuredFacts;
}

function parseFacts(raw: string, date: string): StructuredFacts | null {
  try {
    return JSON.parse(raw) as StructuredFacts;
  } catch (error) {
    logger.warn(SRC, "Unparseable stored facts", { date, error });
    return null;
  }
}

/** Monday of the ET week containing `date` (YYYY-MM-DD). */
function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/**
 * Resolve the week's boundaries from the stored notes.
 *
 * Returns null — and the wrap is skipped rather than guessed — when the week has
 * no notes at all, or when the only available anchor is too old to represent
 * "the previous session before this week".
 */
export async function resolveWeek(today: string): Promise<WeeklyAnchors | null> {
  const monday = mondayOf(today);

  const rows = await db
    .select({ date: dailyNotes.date, facts: dailyNotes.facts })
    .from(dailyNotes)
    .where(and(gte(dailyNotes.date, monday), lte(dailyNotes.date, today)))
    .orderBy(dailyNotes.date);

  const days = rows
    .map((r) => ({ date: r.date, facts: parseFacts(r.facts, r.date) }))
    .filter((d): d is { date: string; facts: StructuredFacts } => d.facts != null);

  if (days.length === 0) {
    logger.warn(SRC, "No daily notes in this week — nothing to wrap", { monday, today });
    return null;
  }

  const anchorRow = await db
    .select({ date: dailyNotes.date, facts: dailyNotes.facts })
    .from(dailyNotes)
    .where(lt(dailyNotes.date, monday))
    .orderBy(desc(dailyNotes.date))
    .limit(1);

  const anchor = anchorRow[0];
  if (!anchor) {
    // The first week after launch. Refuse rather than silently measure from
    // whatever history happens to be reachable.
    logger.warn(SRC, "No prior-week anchor — skipping the first wrap", { monday });
    return null;
  }
  const startFacts = parseFacts(anchor.facts, anchor.date);
  if (!startFacts) return null;

  // A holiday shifts the anchor by a day or two; an outage shifts it by weeks,
  // and the query cannot tell them apart. Refuse to call a fortnight a week.
  if (daysBetween(monday, anchor.date) > MAX_ANCHOR_GAP_DAYS) {
    logger.warn(SRC, "Anchor too old — the span is not a week", { anchor: anchor.date, monday });
    return null;
  }

  return {
    weekEnd: days[days.length - 1].date,
    weekStart: anchor.date,
    days,
    startFacts,
  };
}

export interface WeeklyMove {
  label: string;
  changePct: number;
}

export interface WeeklyFacts {
  weekEnd: string;
  weekStart: string;
  sessions: number;
  indices: WeeklyMove[];
  sectors: WeeklyMove[];
  crossAsset: WeeklyMove[];
  rates: { label: string; changeBp: number }[] | null;
  vix: { start: number; end: number } | null;
  breadth: { sessionsCovered: number; negativeSessions: number; cumulativeNet: number } | null;
  /** Sector ranking flip between the first and second half of the week. */
  rotation: { firstHalfLeader: string; secondHalfLeader: string; rotated: boolean } | null;
}

/** Percent change between two closes, or null when either side is missing. */
function pctChange(from: number | undefined, to: number | undefined): number | null {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return Math.round((to / from - 1) * 100 * 100) / 100;
}

/**
 * Aggregate the week. Every figure comes from the stored facts of the two
 * bounding sessions, so a weekly change is close-to-close over exactly the
 * sessions that happened.
 */
export function aggregateWeek(a: WeeklyAnchors): WeeklyFacts {
  const endFacts = a.days[a.days.length - 1].facts;
  const start = a.startFacts;

  const indices: WeeklyMove[] = [];
  for (const end of endFacts.indices?.value ?? []) {
    const from = start.indices?.value.find((i) => i.symbol === end.symbol);
    const chg = pctChange(from?.close, end.close);
    if (chg != null) indices.push({ label: end.name, changePct: chg });
  }

  // Sector and cross-asset facts store only a daily percent, not a level, so a
  // true weekly change is compounded across the sessions we have. Stated as
  // such rather than implied to be a close-to-close figure.
  const compound = (pick: (f: StructuredFacts) => { key: string; label: string; pct: number }[]) => {
    const acc = new Map<string, { label: string; factor: number; days: number }>();
    for (const d of a.days) {
      for (const item of pick(d.facts)) {
        const cur = acc.get(item.key) ?? { label: item.label, factor: 1, days: 0 };
        cur.factor *= 1 + item.pct / 100;
        cur.days += 1;
        acc.set(item.key, cur);
      }
    }
    return (
      Array.from(acc.values())
        // A series whose fact was degraded out on some day would otherwise show
        // a 4-session figure beside a 5-session index line, under one implied
        // label. Omit rather than mislabel (§1a).
        .filter((v) => v.days === a.days.length)
        .map((v) => ({ label: v.label, changePct: Math.round((v.factor - 1) * 100 * 100) / 100 }))
        .sort((x, y) => y.changePct - x.changePct)
    );
  };

  const sectors = compound((f) =>
    (f.sectors?.value ?? []).map((s) => ({ key: s.etf, label: s.name, pct: s.changePct })),
  );
  const crossAsset = compound((f) =>
    (f.crossAsset?.value ?? [])
      .filter((c) => c.changePct != null)
      .map((c) => ({ key: c.symbol, label: c.label, pct: c.changePct as number })),
  );

  const rEnd = endFacts.rates?.value;
  const rStart = start.rates?.value;
  const rates =
    rEnd && rStart
      ? [
          { label: "2Y", changeBp: Math.round((rEnd.y2 - rStart.y2) * 100) },
          { label: "10Y", changeBp: Math.round((rEnd.y10 - rStart.y10) * 100) },
          { label: "30Y", changeBp: Math.round((rEnd.y30 - rStart.y30) * 100) },
        ]
      : null;

  const vix =
    endFacts.vix && start.vix ? { start: start.vix.value.level, end: endFacts.vix.value.level } : null;

  // Breadth is reported ONLY over the sessions that actually carried an
  // authoritative reading — a missing day is never interpolated, and the count
  // is surfaced so the sentence can state its real denominator.
  const breadthDays = a.days.filter((d) => d.facts.breadth != null);
  const breadth =
    breadthDays.length > 0
      ? {
          sessionsCovered: breadthDays.length,
          negativeSessions: breadthDays.filter((d) => (d.facts.breadth as NonNullable<typeof d.facts.breadth>).value.ratio < 1).length,
          cumulativeNet: breadthDays.reduce((s, d) => {
            const b = (d.facts.breadth as NonNullable<typeof d.facts.breadth>).value;
            return s + (b.advances - b.declines);
          }, 0),
        }
      : null;

  // Did leadership change hands mid-week?
  const half = Math.ceil(a.days.length / 2);
  /** The half's best sector, plus its margin over the runner-up. */
  const leaderOf = (slice: typeof a.days): { name: string; margin: number } | null => {
    const acc = new Map<string, number>();
    for (const d of slice) for (const s of d.facts.sectors?.value ?? []) acc.set(s.name, (acc.get(s.name) ?? 0) + s.changePct);
    const ranked = Array.from(acc.entries()).sort((x, y) => y[1] - x[1]);
    if (ranked.length === 0) return null;
    return { name: ranked[0][0], margin: ranked.length > 1 ? ranked[0][1] - ranked[1][1] : Infinity };
  };
  const first = leaderOf(a.days.slice(0, half));
  const second = leaderOf(a.days.slice(half));
  // A hand-off is only claimed when each half's leader actually led. Without a
  // margin, two sectors separated by 0.01pp print as "leadership rotated" —
  // noise dressed as a finding.
  const ROTATION_MARGIN_PP = 0.5;
  const rotation =
    first && second
      ? {
          firstHalfLeader: first.name,
          secondHalfLeader: second.name,
          rotated:
            first.name !== second.name &&
            first.margin >= ROTATION_MARGIN_PP &&
            second.margin >= ROTATION_MARGIN_PP,
        }
      : null;

  return {
    weekEnd: a.weekEnd,
    weekStart: a.weekStart,
    sessions: a.days.length,
    indices,
    sectors,
    crossAsset,
    rates,
    vix,
    breadth,
    rotation,
  };
}
