/**
 * The sector board's one honesty rule: an industry group ranks WITH the eleven
 * sectors but never counts AS one of them.
 *
 * The board exists to be scanned, so SMH has to sit in the same sorted column
 * as XLK — a semis run against a flat Technology print is invisible in two
 * separate tables. But every statement the page makes across that column is a
 * statement about an eleven-way partition of the market, and semis is a slice
 * of Technology whose members are already counted inside XLK. So the two live
 * in different fields (`sectors` / `thematics`) and only the render merges
 * them, which is exactly the kind of merge that decays back into "just append
 * it to the array" during a later refactor. Hence a test.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectorBoard } from "@/app/markets/notes/daily/[date]/_components/SectorBoard";
import type { StructuredFacts, Fact } from "@/lib/notes/types";

const fact = <T,>(value: T): Fact<T> => ({ value, source: "test", asOf: "2026-08-12T20:00:00Z" });

/** Semis is the day's biggest mover on BOTH horizons — the trap, in both directions. */
function facts(withThematics: boolean): StructuredFacts {
  return {
    date: "2026-08-12",
    sectors: fact([
      { etf: "XLK", name: "Technology", changePct: 0.1 },
      { etf: "XLE", name: "Energy", changePct: -1.2 },
    ]),
    thematics: withThematics ? fact([{ etf: "SMH", name: "Semiconductors", changePct: 2.1 }]) : null,
    timeframes: fact([
      { symbol: "XLK", chg5s: 1.0, chg21s: 2.9, asOfDate: "2026-08-12" },
      { symbol: "XLE", chg5s: -0.4, chg21s: -4.0, asOfDate: "2026-08-12" },
      { symbol: "SMH", chg5s: 4.4, chg21s: 11.8, asOfDate: "2026-08-12" },
    ]),
  } as unknown as StructuredFacts;
}

/** Rendered markup as readable text, the way the sentence reaches a reader. */
function text(withThematics: boolean): string {
  return renderToStaticMarkup(<SectorBoard facts={facts(withThematics)} />)
    .replace(/<[^>]+>/g, "|")
    .replace(/\|+/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("SectorBoard", () => {
  it("ranks an industry group in the same column as the sectors", () => {
    const rendered = text(true);
    // Sorted by today's close, so the +2.1% row leads the +0.1% and -1.2% ones.
    expect(rendered).toMatch(/Semiconductors.*Technology.*Energy/);
  });

  it("marks the industry row so it is not read as a twelfth sector", () => {
    // Adjacency of the marker to the ETF cell is not the claim — the marker
    // riding on the semis row is. The two are no longer neighbours because the
    // row now carries its own source line between them.
    expect(text(true)).toMatch(/Semiconductors industry.*SMH/);
  });

  it("gives the industry row its own provenance", () => {
    // Every other row inherits the `sectors` fact's source line from the section
    // header. A thematic comes from a separate fact with its own feed and its own
    // as-of, and was the one row on the page with no source attached anywhere —
    // so it states its own, inline, beside the marker.
    expect(text(true)).toMatch(/Semiconductors industry · test/);
  });

  it("keeps the 21-session leader sentence to the eleven sectors", () => {
    const rendered = text(true);
    // SMH's +11.8% is the largest 21-session figure ON THE BOARD and must still
    // lose to Technology's +2.9%: "semis leads over 21 sessions" would be a
    // claim about a partition semis is not part of.
    expect(rendered).toContain("Over 21 sessions Technology leads +2.9% and Energy lags -4.0%");
    expect(rendered).not.toMatch(/Over 21 sessions Semiconductors/);
  });

  it("says nothing about industry groups on a note assembled before they existed", () => {
    const rendered = text(false);
    expect(rendered).not.toContain("industry");
    expect(rendered).toContain("Technology");
  });
});
