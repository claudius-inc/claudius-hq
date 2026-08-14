/**
 * Quarterly 13F note ("The Filing") — structured fact types.
 *
 * The daily note's contract applies unchanged: every section is a `Fact<T>`
 * carrying provenance and an as-of, and a section whose source failed is `null`
 * and is OMITTED rather than approximated.
 *
 * Three rules are specific to 13F data and are encoded in the types rather than
 * left to the renderer, because each one has already produced a false statement
 * during design:
 *
 * 1. **A change in book value is not a profit or a loss.** A 13F lists only
 *    US-listed long equity positions — no cash, no bonds, no non-US holdings,
 *    no shorts. A sale therefore leaves the form entirely rather than moving to
 *    another column. `BookChange` splits the two so the page can never print a
 *    fall in book value as a loss: `soldUsd` is a transfer, `valueChangeUsd` is
 *    a gain or loss, and they are different kinds of quantity.
 *
 * 2. **A dollar flow is not a consensus.** Summed across managers, one large
 *    book drowns out twenty-five others: Alphabet's entire net buy this quarter
 *    is Berkshire. `NameFlow` therefore carries `buyers`/`sellers` and the
 *    largest single contributor, and the renderer prints them inline — never a
 *    net figure on its own.
 *
 * 3. **Affiliated filers move books between themselves.** Two Sigma Advisers
 *    filed 2,329 holdings for Q4 2025 and one for Q1 2026; the book moved to
 *    Two Sigma Investments and appeared there as an 84% "gain". `excluded`
 *    records who was dropped and why, so the omission is visible on the page
 *    instead of silently shrinking the universe.
 */
import type { Fact } from "@/lib/notes/types";

/** Net flow in one name, aggregated across the covered managers. */
export interface NameFlow {
  ticker: string;
  name: string;
  /**
   * Net dollars traded: the change in share count priced at the period-end
   * mark, NOT the change in reported value. Value change conflates trading with
   * price moves and would report a market drift as a decision.
   */
  netUsd: number;
  buyers: number;
  sellers: number;
  holdersBefore: number;
  holdersAfter: number;
  /** The manager contributing most of the net, and its share of it. */
  topMover: string;
  /**
   * `topMover`'s share of the net flow. Can exceed 1 when other managers traded
   * the other way — Berkshire is 113% of Alphabet's net because nine managers
   * sold into its buying. Above 0.5 the row is one manager, not a crowd.
   */
  topShare: number;
}

/** One manager's position in one name, before and after. */
export interface ConvictionMove {
  manager: string;
  ticker: string;
  /** Percent of that manager's own book, prior period. */
  fromPct: number;
  /** Percent of that manager's own book, this period. */
  toPct: number;
}

/** A manager's book value change, split into transfer and valuation. */
export interface BookChange {
  manager: string;
  /** Dollars that left (negative) or entered (positive) the stock book. A transfer. */
  soldUsd: number;
  /** Dollars gained or lost on positions still held. A valuation. */
  valueChangeUsd: number;
  /** The sum of the two, and the change in reported book value. */
  bookChangeUsd: number;
}

/** How tightly one manager's money is packed into its largest positions. */
export interface Concentration {
  manager: string;
  /**
   * Holdings needed, counting from the largest down, to reach half the book.
   * Preferred over HHI and over top-10 weight: it is a count, so it needs no
   * key, and unlike top-10 weight it is not blind to the tail.
   */
  holdingsToHalf: number;
  positions: number;
}

/** GICS sector weight change across the combined book. */
export interface SectorShift {
  sector: string;
  /** Change in share of the combined book, in percentage points. */
  changePp: number;
}

/** A manager left out of the universe, and why. */
export interface ExcludedManager {
  manager: string;
  reason: string;
}

/** The universe a quarter's figures were computed over. */
export interface Coverage {
  /** Managers with a complete 13F-HR in BOTH periods. */
  managers: number;
  /** Combined equity book at the period end, USD. */
  combinedBookUsd: number;
  /** Share of the combined book that maps to a GICS sector, 0–1. */
  sectorMapped: number;
  excluded: ExcludedManager[];
}

/**
 * One quarter's note.
 *
 * `priorPeriodEnd` is stored rather than derived: every figure here is a
 * comparison, and a quarter compared against the wrong baseline is wrong in a
 * way no reader can detect. The weekly note stores `weekStart` for the same
 * reason.
 */
export interface ThirteenFFacts {
  /** ISO date of the reporting period end, e.g. "2026-03-31". */
  periodEnd: string;
  /** ISO date of the period this one is compared against. */
  priorPeriodEnd: string;
  coverage: Coverage;
  topBought: Fact<NameFlow[]> | null;
  topSold: Fact<NameFlow[]> | null;
  conviction: Fact<ConvictionMove[]> | null;
  bookChanges: Fact<BookChange[]> | null;
  concentration: Fact<Concentration[]> | null;
  sectors: Fact<SectorShift[]> | null;
}

/**
 * The section order every 13F note renders in. This IS the format — the page
 * maps over it, so a new quarter cannot silently reorder or drop a section.
 *
 * The order runs from the most concrete to the most structural: what was traded
 * (names), who changed their mind (managers), what a change in book value does
 * and does not mean (the reading guardrail), what kind of managers these are,
 * and finally where the money went in aggregate. The guardrail sits third
 * rather than last because everything after it is read differently once you
 * know a shrinking book is not a loss.
 */
export const SECTION_ORDER = [
  { id: "flows", title: "Most bought, most sold" },
  { id: "conviction", title: "Changes of mind" },
  { id: "books", title: "Decision or market" },
  { id: "concentration", title: "How concentrated they are" },
  { id: "sectors", title: "Where the money moved" },
] as const;

export type SectionId = (typeof SECTION_ORDER)[number]["id"];
