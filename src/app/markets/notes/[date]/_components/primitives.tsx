import type { ReactNode } from "react";
import type { Fact } from "@/lib/notes/types";
import { spct, toneClass, etTime } from "../_lib/format";

/**
 * Shared leaf components for the daily note.
 *
 * Two rules run through all of them and are worth stating once:
 *
 * 1. Direction is NEVER colour alone. Every coloured number keeps its sign, and
 *    every bar prints its value adjacent. Colour is reinforcement.
 * 2. No emoji, and no ▲/▼ glyphs — those font-substitute per platform (see
 *    `src/lib/notes/render.ts`), which is the same defect as emoji.
 */

/** A ticker symbol. Monospace so a column of them aligns. */
export function Ticker({ symbol }: { symbol: string }) {
  return <span className="font-mono text-[0.8125rem] tracking-tight text-gray-900">{symbol}</span>;
}

/** A signed percentage in its direction colour. */
export function Pct({ value, dp = 1, className = "" }: { value: number; dp?: number; className?: string }) {
  return <span className={`tabular-nums ${toneClass(value)} ${className}`}>{spct(value, dp)}</span>;
}

/**
 * A figure the feed did not deliver. Visually distinct from a real zero, and it
 * says why on hover — a bare level sitting beside a peer that carries a change
 * otherwise reads as "unchanged", which is a claim nobody made.
 */
export function NoValue({ reason = "Not available from the source feed" }: { reason?: string }) {
  return (
    // gray-500 (4.83:1), not gray-400 (2.54:1). This marker is the entire
    // mechanism that separates "the feed gave us nothing" from "zero", so it
    // cannot be the least legible ink on the page. The reason is an aria-label
    // as well as a title: `title` is unreachable on touch and by keyboard.
    <span className="text-gray-500 tabular-nums" title={reason} aria-label={reason} role="img">
      &mdash;
    </span>
  );
}

/**
 * Source and as-of for one fact. The pipeline already pays for provenance on
 * every section (`Fact<T>`); showing it is what makes an archived note citable
 * months later, and it is the only way to know the Treasury yields are a
 * 3:30pm ET print while the index closes are 4:00pm.
 */
export function Provenance({ fact }: { fact: Fact<unknown> | null }) {
  if (!fact) return null;
  return (
    <p className="text-[11px] text-gray-500 tabular-nums">
      {fact.source} &middot; {etTime(fact.asOf)}
    </p>
  );
}

/**
 * A tier-3 section: real `<h2>` with a stable id so the section rail can jump to
 * it, and `scroll-mt-24` so the jump clears the sticky markets tab bar.
 */
export function Section({
  id,
  title,
  fact,
  intro,
  children,
}: {
  id: string;
  title: string;
  fact?: Fact<unknown> | null;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {fact ? <Provenance fact={fact} /> : null}
      </div>
      {intro ? <p className="text-sm text-gray-600 mb-3 max-w-[68ch]">{intro}</p> : null}
      {children}
    </section>
  );
}

/**
 * What a section says when it has nothing to show.
 *
 * The distinction matters more on an archive page than in the push. Omitting a
 * section silently is right for a notification — the reader gets a fresh one
 * tomorrow. Here it destroys cross-day comparison: a missing divergence block
 * could mean the market was calm or the holdings seed was stale, and those are
 * opposite conclusions.
 */
export function Absent({
  fact,
  quiet,
  missing,
}: {
  /**
   * The fact itself, NOT its unwrapped array. `null` means the feed produced
   * nothing; a present fact with an empty value means the feed worked and the
   * market was quiet. Collapsing the two with `?? []` is how the page came to
   * assert "no economic releases printed this session" on a day the calendar
   * feed had simply returned nothing at all.
   */
  fact: Fact<unknown> | null;
  /** What to say when the feed worked and there was genuinely nothing. */
  quiet: string;
  /** The subject, for the feed-failure sentence: "Breadth" → "Breadth is unavailable…". */
  missing: string;
}) {
  if (fact) return <p className="text-sm text-gray-500 italic">{quiet}</p>;
  return (
    <p className="text-sm text-gray-500 italic">
      {missing} is unavailable for this session — the source returned no data, so nothing is shown
      rather than an approximation.
    </p>
  );
}

/**
 * Table shell. Always scrollable in its own box so the page body never does.
 *
 * The hint is not decoration. On a phone the wider tables push their most
 * valuable columns off-screen with no visual cue at all — the frame simply
 * ends — so a reader concludes the data is missing rather than sideways.
 */
export function TableWrap({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div>
      {hint ? (
        <p className="sm:hidden text-[11px] text-gray-500 mb-1" aria-hidden="true">
          {hint}
        </p>
      ) : null}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">{children}</div>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}
