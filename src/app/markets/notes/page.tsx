import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, dailyNotes, weeklyNotes } from "@/db";
import { logger } from "@/lib/logger";
import { PageHero } from "@/components/PageHero";
import { EmptyState } from "@/components/EmptyState";
import { FileText } from "lucide-react";
import { deterministicHook } from "@/lib/notes/render";
import { THIRTEEN_F_PERIODS } from "@/lib/notes/thirteenf/periods";
import type { StructuredFacts, NoteProse } from "@/lib/notes/types";
import { shortDayDate, shortDate, spct, intFmt, toneClass } from "./daily/[date]/_lib/format";

// Same reasoning as the note page: written by an external script with no Next
// context to revalidate from, so read fresh per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Market notes",
  description: "The archive of daily market notes, weekly wraps, and quarterly 13F filings.",
};

const SRC = "markets/notes/index";
const LIMIT = 60;

import { FILTERS, resolveFilter, kindFor, filterHref, type NoteKind } from "./_lib/filter";

/**
 * The badge that tells the three note kinds apart.
 *
 * One list rather than three sections: the kinds interleave in time, and a
 * reader looking for "the most recent thing" should not have to check three
 * places and compare dates by hand. The badge is what makes that legible, so it
 * is a fixed-width column rather than an inline tag — a ragged badge edge would
 * cost more scanning than the sections did.
 *
 * The label is the load-bearing part; the tint only reinforces it. Colour alone
 * would leave the kinds indistinguishable in greyscale, which is the same rule
 * the note charts follow.
 */
const KIND: Record<NoteKind, { label: string; cls: string }> = {
  daily: { label: "Daily", cls: "bg-gray-100 text-gray-600" },
  weekly: { label: "Weekly", cls: "bg-sky-50 text-sky-700" },
  quarterly: { label: "13F", cls: "bg-gray-400 text-white" },
};

interface Entry {
  kind: NoteKind;
  /** ISO date the row is filed under, and the sort key across all kinds. */
  date: string;
  href: string;
  summary: ReactNode;
  /** Daily only — the session's close and change, right-aligned. */
  close?: number | null;
  changePct?: number | null;
}

/** One daily row, derived from the persisted facts rather than the rendered body. */
function toDaily(date: string, factsJson: string, proseJson: string | null): Entry {
  try {
    const facts = JSON.parse(factsJson) as StructuredFacts;
    const prose = proseJson ? (JSON.parse(proseJson) as NoteProse) : null;
    const sp = facts.indices?.value.find((i) => i.symbol === "^GSPC");
    return {
      kind: "daily",
      date,
      href: `/markets/notes/daily/${date}`,
      summary: prose?.hook ?? deterministicHook(facts),
      close: sp?.close ?? null,
      changePct: sp?.changePct ?? null,
    };
  } catch (error) {
    // One corrupt row must not take down the whole archive — but it must not
    // render as a normal note with an empty summary either, which looks like a
    // quiet day rather than a broken record.
    logger.warn(SRC, "Unparseable note in the index", { date, error });
    return {
      kind: "daily",
      date,
      href: `/markets/notes/daily/${date}`,
      summary: <span className="italic text-gray-500">This note&apos;s record could not be read.</span>,
      close: null,
      changePct: null,
    };
  }
}

export default async function NotesIndexPage(props: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const active = resolveFilter((await props.searchParams).kind);
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

  const entries: Entry[] = [
    ...daily.map((d) => toDaily(d.date, d.facts, d.prose)),
    ...weekly.map<Entry>((w) => ({
      kind: "weekly",
      date: w.weekEnd,
      href: `/markets/notes/weekly/${w.weekEnd}`,
      summary: `The Week · ${w.sessions} session${w.sessions === 1 ? "" : "s"} from ${shortDate(w.weekStart)}`,
    })),
    ...THIRTEEN_F_PERIODS.map<Entry>((p) => ({
      kind: "quarterly",
      date: p.periodEnd,
      href: `/markets/notes/13f/${p.periodEnd}`,
      summary: `The Filing · ${p.coverage.managers} managers, $${(p.coverage.combinedBookUsd / 1e12).toFixed(2)}T combined`,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // Counts come from the FULL set, so a pill still shows what it would reveal
  // while a different filter is applied — a "13F 1" that reads 0 whenever you
  // are not already looking at 13F notes would be useless.
  const counts = FILTERS.map((f) => ({
    ...f,
    n: f.kind ? entries.filter((e) => e.kind === f.kind).length : entries.length,
  }));
  const want = kindFor(active);
  const shown = want ? entries.filter((e) => e.kind === want) : entries;
  const activeLabel = FILTERS.find((f) => f.key === active)!.label.toLowerCase();

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <PageHero title="Market notes" subtitle="The Tape, The Week, and The Filing" />

      {entries.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-6 h-6" />}
          title="No notes yet"
          description="The first note appears after the pipeline runs following a US market close."
        />
      ) : (
        <>
          <nav aria-label="Filter notes by type" className="flex flex-wrap gap-1.5 mb-4">
            {counts.map((f) => {
              const on = f.key === active;
              return (
                <Link
                  key={f.key}
                  href={filterHref(f.key)}
                  aria-current={on ? "page" : undefined}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    on
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900"
                  }`}
                >
                  {f.label}
                  {/* The count is the affordance: it says what a pill will show
                      before it is clicked, so an empty kind is visibly empty
                      rather than a filter that appears to have broken. */}
                  <span className={`ml-1.5 tabular-nums ${on ? "text-gray-300" : "text-gray-400"}`}>{f.n}</span>
                </Link>
              );
            })}
          </nav>

          {shown.length === 0 ? (
            <p className="text-sm text-gray-500 italic py-6">
              No {activeLabel} notes yet. The other types are still listed under All.
            </p>
          ) : (
          <ul className="divide-y divide-gray-100 border-t border-gray-200">
            {shown.map((e) => (
              <li key={`${e.kind}-${e.date}`}>
                <Link
                  href={e.href}
                  className="flex items-baseline gap-3 py-3 hover:bg-gray-50 transition-colors -mx-2 px-2 rounded"
                >
                  {/* Quarter ends keep their year: a 13F row is read against
                      other quarters, which span years, and its weekday means
                      nothing. Sessions and weeks drop it — see shortDayDate. */}
                  <span className="text-sm font-medium text-gray-900 tabular-nums w-24 shrink-0 whitespace-nowrap">
                    {e.kind === "quarterly"
                      ? new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })
                      : shortDayDate(e.date)}
                  </span>
                  <span
                    className={`text-[11px] font-medium px-1.5 py-0.5 rounded w-14 text-center shrink-0 ${KIND[e.kind].cls}`}
                  >
                    {KIND[e.kind].label}
                  </span>
                  <span className="text-sm text-gray-600 min-w-0 flex-1 truncate">{e.summary}</span>
                  {e.changePct != null && (
                    <span className={`text-sm font-medium tabular-nums shrink-0 ${toneClass(e.changePct)}`}>
                      {e.close != null && <span className="text-gray-500 font-normal mr-2">{intFmt(e.close)}</span>}
                      {spct(e.changePct)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          )}
          {/* Only when dailies are actually on screen — the cap is a daily one,
              and printing it under a 13F-only list would claim a truncation
              that did not happen. */}
          {daily.length === LIMIT && shown.some((e) => e.kind === "daily") && (
            // The archive truncates. Saying so beats a list that just stops —
            // a reader looking for a note from four months ago would otherwise
            // conclude it was never written.
            <p className="mt-3 text-xs text-gray-600">
              Showing the most recent {LIMIT} sessions. Older notes remain reachable at
              <span className="font-mono"> /markets/notes/daily/YYYY-MM-DD</span>.
            </p>
          )}
        </>
      )}
    </div>
  );
}
