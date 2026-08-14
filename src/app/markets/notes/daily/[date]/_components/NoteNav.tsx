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
 * without a scroll hunt. Deliberately NOT sticky: `MarketsTabs` already pins
 * itself at `top-12`, and a second sticky band would need an exact matching
 * offset to avoid overlapping it.
 */
export function SectionRail({ sections }: { sections: { id: string; label: string }[] }) {
  if (sections.length === 0) return null;
  return (
    <nav aria-label="Sections of this note" className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
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
