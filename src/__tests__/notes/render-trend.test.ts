/**
 * The two renderer paths that §D's single-name timeframes touch.
 *
 * Adding the relevance union to the `timeframes` fact means TREND — which is a
 * statement about BENCHMARKS — is now reading a list that also contains
 * constituents. Getting that wrong would print a single stock as the sector
 * leading the market for 21 sessions, which reads as a data error rather than
 * an editorial one.
 */
import { describe, it, expect } from "vitest";
import { renderPush, renderWeb } from "@/lib/notes/render";
import type { StructuredFacts, TimeframeMove } from "@/lib/notes/types";

const fact = <T,>(value: T) => ({ value, source: "test", asOf: "2026-08-07T20:00:00Z" });

function facts(partial: Partial<StructuredFacts> = {}): StructuredFacts {
  return {
    date: "2026-08-07",
    generatedAt: "2026-08-07T22:15:00Z",
    indices: fact([{ symbol: "^GSPC", name: "S&P 500", close: 7704.12, changePct: -0.1 }]),
    rates: null,
    vix: null,
    crossAsset: null,
    sectors: null,
    thematics: null,
    breadth: null,
    divergence: null,
    contribution: null,
    gexPin: null,
    econEvents: null,
    spotlight: null,
    postMarket: null,
    timeframes: null,
    macro: null,
    movers: null,
    attributions: null,
    companyNames: null,
    ...partial,
  };
}

const tf = (symbol: string, chg5s: number | null, chg21s: number | null): TimeframeMove => ({
  symbol,
  chg5s,
  chg21s,
  asOfDate: "2026-08-07",
});

const url = "https://example.com/n";

describe("TREND", () => {
  it("picks the leading and lagging SECTOR, never a constituent", () => {
    const f = facts({
      timeframes: fact([
        tf("^GSPC", 0.8, 3.1),
        tf("XLE", 1.2, 7.4),
        tf("XLRE", -0.5, -4.2),
        // A constituent with the most extreme 21-session move of them all. It
        // must not be described as leading "over 21 sessions" — that line is
        // about sectors.
        tf("NVDA", 9, 40),
      ]),
    });
    const out = renderPush({ facts: f, webUrl: url });
    expect(out).toContain("XLE leads +7.4%");
    expect(out).toContain("XLRE lags -4.2%");
    expect(out).not.toContain("NVDA leads");
  });

  it("does not mistake a constituent starting with XL for a sector", () => {
    const f = facts({
      timeframes: fact([tf("^GSPC", 0.8, 3.1), tf("XLE", 1.2, 7.4), tf("XLNX", 2, 99)]),
    });
    expect(renderPush({ facts: f, webUrl: url })).not.toContain("XLNX");
  });

  it("omits the sector lead entirely when fewer than two sectors have a figure", () => {
    const f = facts({ timeframes: fact([tf("^GSPC", 0.8, 3.1), tf("NVDA", 9, 40)]) });
    const out = renderPush({ facts: f, webUrl: url });
    expect(out).toContain("TREND");
    expect(out).not.toContain("over 21 sessions");
  });
});

describe("Movers in session context (web only)", () => {
  const withMovers = facts({
    movers: fact([
      { ticker: "AKAM", changePct: -6.8 },
      { ticker: "BRK.B", changePct: 2.1 },
    ]),
    timeframes: fact([tf("^GSPC", 0.8, 3.1), tf("AKAM", -9.2, -14.5), tf("BRK-B", 1.1, 4.4)]),
  });

  it("puts each mover's day in the context of its own recent run", () => {
    const web = renderWeb({ facts: withMovers, webUrl: url });
    expect(web).toContain("Movers in session context");
    expect(web).toContain("5-session -9.2%");
    expect(web).toContain("21-session -14.5%");
  });

  it("maps a dotted share class to the Yahoo spelling the timeframes are keyed by", () => {
    // movers carry BRK.B, timeframes carry BRK-B. Without the mapping the row
    // silently disappears — a missing row, not a visible error.
    const web = renderWeb({ facts: withMovers, webUrl: url });
    expect(web).toContain("BRK.B");
    expect(web).toContain("21-session +4.4%");
  });

  it("stays out of the push, which is about benchmarks", () => {
    expect(renderPush({ facts: withMovers, webUrl: url })).not.toContain("Movers in session context");
  });

  it("shows n/a for one dropped figure rather than leaving a silent blank", () => {
    const f = facts({
      movers: fact([{ ticker: "AKAM", changePct: -6.8 }]),
      timeframes: fact([tf("AKAM", -9.2, null)]),
    });
    expect(renderWeb({ facts: f, webUrl: url })).toContain("21-session n/a");
  });

  it("omits a name whose figures were both dropped", () => {
    const f = facts({
      movers: fact([{ ticker: "AKAM", changePct: -6.8 }]),
      timeframes: fact([tf("AKAM", null, null)]),
    });
    expect(renderWeb({ facts: f, webUrl: url })).not.toContain("Movers in session context");
  });
});
