import { eq, and, lt, gt, lte, gte, desc, asc } from "drizzle-orm";
import { db, dailyNotes, weeklyNotes } from "@/db";
import { logger } from "@/lib/logger";
import type { StructuredFacts, NoteProse } from "@/lib/notes/types";

const SRC = "markets/notes/date";

export interface LoadedNote {
  date: string;
  facts: StructuredFacts;
  prose: NoteProse | null;
  /** Previous / next session that actually produced a note. */
  prevDate: string | null;
  nextDate: string | null;
  /** The weekly wrap covering this date, when one has been written. */
  weekEnd: string | null;
}

/**
 * A persisted note, parsed.
 *
 * The page renders from `facts` + `prose` rather than the pre-baked `webBody`
 * column. `webBody` is the Telegram push wrapped in `<p>` tags plus a few
 * appended lists, which meant every topic appeared twice on the page and the
 * whole thing inherited constraints that only exist because a push is capped at
 * 4096 characters. `facts` is `notNull`, so every note ever persisted can be
 * rendered this way. `webBody` is still written and still readable — it is just
 * no longer what the page shows.
 */
export async function loadNote(date: string): Promise<LoadedNote | null> {
  const rows = await db.select().from(dailyNotes).where(eq(dailyNotes.date, date)).limit(1);
  const note = rows[0];
  if (!note) return null;

  let facts: StructuredFacts;
  try {
    facts = JSON.parse(note.facts) as StructuredFacts;
  } catch (error) {
    // A row exists but its facts are unparseable — that is a corrupt record,
    // not a missing note, and it must be loud rather than a silent 404.
    logger.error(SRC, "Persisted facts are not valid JSON", { date, error });
    throw new Error(`Daily note ${date} has unparseable facts`);
  }

  let prose: NoteProse | null = null;
  if (note.prose) {
    try {
      prose = JSON.parse(note.prose) as NoteProse;
    } catch (error) {
      // Prose is additive by design, so a bad blob degrades to the
      // deterministic note rather than failing the page.
      logger.warn(SRC, "Persisted prose is not valid JSON; rendering without it", { date, error });
    }
  }

  // Neighbours come from the table, never from date arithmetic: weekends,
  // holidays and any session the gate skipped must be stepped over rather than
  // linked to a 404.
  const [prev, next, week] = await Promise.all([
    db
      .select({ date: dailyNotes.date })
      .from(dailyNotes)
      .where(lt(dailyNotes.date, date))
      .orderBy(desc(dailyNotes.date))
      .limit(1),
    db
      .select({ date: dailyNotes.date })
      .from(dailyNotes)
      .where(gt(dailyNotes.date, date))
      .orderBy(asc(dailyNotes.date))
      .limit(1),
    db
      .select({ weekEnd: weeklyNotes.weekEnd })
      .from(weeklyNotes)
      .where(and(lte(weeklyNotes.weekStart, date), gte(weeklyNotes.weekEnd, date)))
      .limit(1),
  ]);

  return {
    date: note.date,
    facts,
    prose,
    prevDate: prev[0]?.date ?? null,
    nextDate: next[0]?.date ?? null,
    weekEnd: week[0]?.weekEnd ?? null,
  };
}

/**
 * The tier-3 sections this note actually has content for, in render order.
 *
 * Built from the same nullability the sections themselves branch on, so the
 * rail can never advertise an anchor that scrolls to an empty block. Sections
 * whose absence is itself worth stating (the calendar ones) always appear —
 * see `CalendarSection`.
 */
export function sectionRailItems(
  facts: StructuredFacts,
  prose: NoteProse | null = null,
): { id: string; label: string }[] {
  const items: { id: string; label: string }[] = [];
  // Matches `TheRead`'s own guard, so the rail can never offer an anchor that
  // scrolls to nothing. The label has to match the heading the reader lands on:
  // with no prose, the only visible heading in that section is "The book".
  if (prose || facts.gexPin) {
    items.push({ id: "read", label: prose ? "The read" : "The book" });
  }
  if (facts.rates) items.push({ id: "rates", label: "Rates" });
  if (facts.crossAsset) items.push({ id: "cross-asset", label: "Cross-asset" });
  if (facts.sectors) items.push({ id: "sectors", label: "Sectors" });
  if (facts.movers) items.push({ id: "movers", label: "Movers" });
  if (facts.divergence) items.push({ id: "divergence", label: "Divergence" });
  if (facts.contribution) items.push({ id: "concentration", label: "Concentration" });
  if (facts.spotlight) items.push({ id: "spotlight", label: "Spotlight" });
  // Both calendar sections always render (their absence is itself the claim),
  // and each gets its own chip — labelled with the heading it actually lands on.
  items.push({ id: "data", label: "Data today" });
  items.push({ id: "tells", label: "Next session" });
  return items;
}
