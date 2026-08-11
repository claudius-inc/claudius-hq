import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, dailyNotes, weeklyNotes } from "@/db";
import { logger } from "@/lib/logger";
import { PageHero } from "@/components/PageHero";
import { EmptyState } from "@/components/EmptyState";
import { FileText } from "lucide-react";
import { deterministicHook } from "@/lib/notes/render";
import type { StructuredFacts, NoteProse } from "@/lib/notes/types";
import { prettyDate, spct, intFmt, toneClass } from "./[date]/_lib/format";

// Same reasoning as the note page: written by an external script with no Next
// context to revalidate from, so read fresh per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Market notes",
  description: "The archive of daily market notes and weekly wraps.",
};

/** "Aug 10, 2026" — short enough not to wrap in the archive rail. */
function shortYearDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SRC = "markets/notes/index";
const LIMIT = 60;

interface Row {
  date: string;
  hook: string;
  close: number | null;
  changePct: number | null;
  /** True when the row's facts could not be parsed — rendered, but marked. */
  corrupt: boolean;
}

/** One archive row, derived from the persisted facts rather than the rendered body. */
function toRow(date: string, factsJson: string, proseJson: string | null): Row {
  try {
    const facts = JSON.parse(factsJson) as StructuredFacts;
    const prose = proseJson ? (JSON.parse(proseJson) as NoteProse) : null;
    const sp = facts.indices?.value.find((i) => i.symbol === "^GSPC");
    return {
      date,
      hook: prose?.hook ?? deterministicHook(facts),
      close: sp?.close ?? null,
      changePct: sp?.changePct ?? null,
      corrupt: false,
    };
  } catch (error) {
    // One corrupt row must not take down the whole archive — but it must not
    // render as a normal note with an empty summary either, which looks like a
    // quiet day rather than a broken record.
    logger.warn(SRC, "Unparseable note in the index", { date, error });
    return { date, hook: "", close: null, changePct: null, corrupt: true };
  }
}

export default async function NotesIndexPage() {
  const [daily, weekly] = await Promise.all([
    db
      .select({ date: dailyNotes.date, facts: dailyNotes.facts, prose: dailyNotes.prose })
      .from(dailyNotes)
      .orderBy(desc(dailyNotes.date))
      .limit(LIMIT),
    db
      .select({ weekEnd: weeklyNotes.weekEnd, weekStart: weeklyNotes.weekStart, sessions: weeklyNotes.sessions })
      .from(weeklyNotes)
      .orderBy(desc(weeklyNotes.weekEnd))
      .limit(12),
  ]);

  const rows = daily.map((d) => toRow(d.date, d.facts, d.prose));

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <PageHero title="Market notes" subtitle="The Tape, every session the US market traded" />

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-6 h-6" />}
          title="No notes yet"
          description="The first note appears after the pipeline runs following a US market close."
        />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">Daily</h2>
            <ul className="divide-y divide-gray-100 border-t border-gray-200">
              {rows.map((r) => (
                <li key={r.date}>
                  <Link
                    href={`/markets/notes/${r.date}`}
                    className="flex items-baseline gap-4 py-3 hover:bg-gray-50 transition-colors -mx-2 px-2 rounded"
                  >
                    {/* w-32 and nowrap: "September 10, 2026" wrapped to two
                        lines at w-28 and broke the row rhythm. */}
                    <span className="text-sm font-medium text-gray-900 tabular-nums w-32 shrink-0 whitespace-nowrap">
                      {shortYearDate(r.date)}
                    </span>
                    <span className="text-sm text-gray-600 min-w-0 flex-1 truncate">
                      {r.corrupt ? (
                        <span className="italic text-gray-500">
                          This note&apos;s record could not be read.
                        </span>
                      ) : (
                        r.hook
                      )}
                    </span>
                    {r.changePct != null && (
                      <span className={`text-sm font-medium tabular-nums shrink-0 ${toneClass(r.changePct)}`}>
                        {r.close != null && (
                          <span className="text-gray-500 font-normal mr-2">{intFmt(r.close)}</span>
                        )}
                        {spct(r.changePct)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {rows.length === LIMIT && (
              // The archive truncates. Saying so beats a list that just stops —
              // a reader looking for a note from four months ago would otherwise
              // conclude it was never written.
              <p className="mt-3 text-xs text-gray-600">
                Showing the most recent {LIMIT} sessions. Older notes remain reachable at
                <span className="font-mono"> /markets/notes/YYYY-MM-DD</span>.
              </p>
            )}
          </section>

          {weekly.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">Weekly</h2>
              <ul className="divide-y divide-gray-100 border-t border-gray-200">
                {weekly.map((w) => (
                  <li key={w.weekEnd}>
                    <Link
                      href={`/markets/notes/weekly/${w.weekEnd}`}
                      className="flex items-baseline gap-4 py-3 hover:bg-gray-50 transition-colors -mx-2 px-2 rounded"
                    >
                      <span className="text-sm font-medium text-gray-900 tabular-nums w-32 shrink-0 whitespace-nowrap">
                        {shortYearDate(w.weekEnd)}
                      </span>
                      <span className="text-sm text-gray-600">
                        Week ending {prettyDate(w.weekEnd)} &middot; {w.sessions} session
                        {w.sessions === 1 ? "" : "s"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
