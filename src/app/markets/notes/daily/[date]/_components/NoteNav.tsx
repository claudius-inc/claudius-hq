import Link from "next/link";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import type { StructuredFacts } from "@/lib/notes/types";
import { LocalTime } from "@/components/ui/LocalTime";
import { prettyDate, shortDate } from "../_lib/format";

/**
 * A horizontal rail of anchors to the tier-3 sections.
 *
 * An archive page is consulted far more often than it is read, so the dominant
 * use is a targeted lookup — "where did the 10Y close on the 10th". The
 * scoreboard answers most of those above the fold; this rail answers the rest
 * without a scroll hunt.
 *
 * STICKY, below `MarketsTabs`. Non-sticky it scrolled away after the first
 * section and was useless for exactly the lookup it exists to serve — nine
 * sections, six of them scrollable tables.
 *
 * `top-24` is empirical, not derived: `MarketsTabs` pins at `top-12` and is
 * content-sized, so there is no height constant to inherit. The `z-20` here
 * against its `z-40` is what makes that safe — if the tab row grows, this rail
 * tucks UNDER it rather than overlapping it, which loses a few pixels of chips
 * instead of producing two bands of unreadable overprinted text.
 *
 * `bg-white` is load-bearing, not cosmetic — a transparent sticky bar lets the
 * tables scroll visibly underneath the chips.
 */
export function SectionRail({ sections }: { sections: { id: string; label: string }[] }) {
  if (sections.length === 0) return null;
  return (
    <nav
      aria-label="Sections of this note"
      className="sticky top-24 z-20 bg-white overflow-x-auto scrollbar-hide -mx-4 px-4 py-2 sm:mx-0 sm:px-0 border-b border-gray-100"
    >
      <ul className="flex items-center gap-2 w-max">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="inline-block px-2.5 py-1 rounded-full text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors whitespace-nowrap"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Previous session, archive, next session — plus the weekly wrap that covers
 * this date when one exists.
 *
 * The neighbours come from the table rather than from date arithmetic, so
 * weekends, holidays and any session the gate skipped are stepped over instead
 * of producing a link to a 404.
 */
export function NoteFooterNav({
  prevDate,
  nextDate,
  weekEnd,
}: {
  prevDate: string | null;
  nextDate: string | null;
  weekEnd: string | null;
}) {
  return (
    <nav aria-label="Other notes" className="border-t border-gray-200 pt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        {prevDate ? (
          <Link
            href={`/markets/notes/daily/${prevDate}`}
            className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800"
            rel="prev"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            {shortDate(prevDate)}
          </Link>
        ) : (
          <span className="text-sm text-gray-500">Earliest note</span>
        )}

        <Link
          href="/markets/notes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <List className="w-4 h-4" aria-hidden="true" />
          All notes
        </Link>

        {nextDate ? (
          <Link
            href={`/markets/notes/daily/${nextDate}`}
            className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800"
            rel="next"
          >
            {shortDate(nextDate)}
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-sm text-gray-500">Latest note</span>
        )}
      </div>

      {weekEnd && (
        <p className="text-sm text-gray-600">
          Covered by the wrap for{" "}
          <Link
            href={`/markets/notes/weekly/${weekEnd}`}
            className="text-emerald-700 hover:text-emerald-800"
          >
            the week ending {prettyDate(weekEnd)}
          </Link>
          .
        </p>
      )}
    </nav>
  );
}

/**
 * Every source the note drew on, with what each was "as of".
 *
 * The pipeline already pays for provenance on every `Fact<T>`; printing it is
 * what makes a three-month-old note citable. The coverage count is the other
 * half of the empty-state answer: it distinguishes "eleven of fourteen sections
 * present" from a page that silently rendered short.
 */
export function SourcesFooter({ facts }: { facts: StructuredFacts }) {
  const sections: { label: string; key: keyof StructuredFacts }[] = [
    { label: "Indices", key: "indices" },
    { label: "Breadth", key: "breadth" },
    { label: "VIX", key: "vix" },
    { label: "Rates", key: "rates" },
    { label: "Cross-asset", key: "crossAsset" },
    { label: "Sectors", key: "sectors" },
    // Its own feed and its own as-of, so it is its own entry. Leaving it out
    // understated the denominator AND left the semis row with no source line
    // anywhere on the page — the coverage count is meant to answer "did the page
    // render short", which it cannot do while it is blind to a whole fact.
    { label: "Industry groups", key: "thematics" },
    { label: "Timeframes", key: "timeframes" },
    { label: "Movers", key: "movers" },
    { label: "Attributions", key: "attributions" },
    { label: "Divergence", key: "divergence" },
    { label: "Concentration", key: "contribution" },
    { label: "Gamma pin", key: "gexPin" },
    { label: "Spotlight", key: "spotlight" },
    { label: "Post-market", key: "postMarket" },
    { label: "Economic releases", key: "macro" },
    { label: "Upcoming releases", key: "econEvents" },
  ];

  const present = sections
    .map((s) => {
      const fact = facts[s.key] as { source: string; asOf: string } | null;
      return fact ? { label: s.label, source: fact.source, asOf: fact.asOf } : null;
    })
    .filter((x): x is { label: string; source: string; asOf: string } => x !== null);

  return (
    <details className="border-t border-gray-200 pt-4 group">
      {/* `list-none` removes the native marker, so without an explicit chevron
          the provenance for the whole note sat behind a control that looked
          exactly like body text. */}
      <summary className="flex items-center gap-1.5 text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900 list-none">
        <ChevronRight
          className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        Sources &amp; coverage — {present.length} of {sections.length} sections present
      </summary>
      <ul className="mt-3 space-y-1">
        {present.map((p) => (
          <li key={p.label} className="text-xs text-gray-600">
            <span className="font-medium text-gray-900">{p.label}</span> — {p.source} &middot;{" "}
            <LocalTime iso={p.asOf} withDate className="tabular-nums" />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-600">
        Note assembled <LocalTime iso={facts.generatedAt} withDate className="tabular-nums" />. Sections whose
        feed failed or returned non-authoritative data are omitted rather than approximated.
      </p>
    </details>
  );
}
