/**
 * MOVERS (v2 §A + §B). Two properties matter here and neither is obvious from
 * reading the renderer:
 *
 *  - A name the ranking surfaced but for which NO reason passed the ladder must
 *    still print, bare (§B rung 7). Suppressing it would quietly make "we found
 *    a reason" the condition for being mentioned, which is a selection bias in
 *    the one section that names companies.
 *  - The overflow ladder must be monotonic: every rung has to render no longer
 *    than the rung before it, or degrading the note can make it bigger.
 */
import { describe, it, expect } from "vitest";
import { renderPush, pushLadder } from "@/lib/notes/render";
import type { StructuredFacts, NoteProse } from "@/lib/notes/types";

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
    ledger: null,
    ...partial,
  };
}

const AKAM_ATTRIBUTION = {
  ticker: "AKAM",
  rung: "earnings" as const,
  verb: "after" as const,
  phrase: "AKAM fell -6.8% after reporting EPS $1.59",
};

describe("MOVERS", () => {
  it("prints a ranked name with no attribution as a bare move (rung 7)", () => {
    const out = renderPush({
      facts: facts({ movers: fact([{ ticker: "SLB", changePct: -2.4 }]) }),
      webUrl: "https://example.com/n",
    });
    expect(out).toContain("MOVERS");
    expect(out).toContain("SLB -2.4%");
  });

  it("prefers the retrieved phrase when one exists", () => {
    const out = renderPush({
      facts: facts({
        movers: fact([{ ticker: "AKAM", changePct: -6.8 }]),
        attributions: fact([AKAM_ATTRIBUTION]),
      }),
      webUrl: "https://example.com/n",
    });
    expect(out).toContain("AKAM fell -6.8% after reporting EPS $1.59");
  });

  it("renders in ranking order, mixing attributed and bare lines", () => {
    const out = renderPush({
      facts: facts({
        movers: fact([
          { ticker: "SLB", changePct: -2.4 },
          { ticker: "AKAM", changePct: -6.8 },
        ]),
        attributions: fact([AKAM_ATTRIBUTION]),
      }),
      webUrl: "https://example.com/n",
    });
    expect(out.indexOf("SLB -2.4%")).toBeLessThan(out.indexOf("AKAM fell"));
  });

  it("floors a bare line at the same move the attribution gate uses", () => {
    // Below the floor the line is not a mover, it is noise with a ticker on it.
    const out = renderPush({
      facts: facts({ movers: fact([{ ticker: "KO", changePct: 0.3 }]) }),
      webUrl: "https://example.com/n",
    });
    expect(out).not.toContain("MOVERS");
  });

  it("still renders an archived note that predates the stored ranking", () => {
    const out = renderPush({
      facts: facts({ movers: null, attributions: fact([AKAM_ATTRIBUTION]) }),
      webUrl: "https://example.com/n",
    });
    expect(out).toContain("AKAM fell -6.8% after reporting EPS $1.59");
  });
});

describe("overflow ladder", () => {
  it("is monotonic — no rung renders longer than the rung before it", () => {
    // Long enough to walk several rungs, so the ordering is actually exercised.
    const prose: NoteProse = {
      hook: "S&P flat at highs, but decliners beat gainers three to two.",
      curveRead: "Front end led the selloff; the cut just got repriced out.",
      whatMatters: [
        `Narrow leadership. ${"The index held its direction on a handful of names. ".repeat(6)}`,
        `Rate-sensitives wore it. ${"REITs and utilities sat at the bottom of the board. ".repeat(6)}`,
        `Breadth disagrees. ${"Advancers lost to decliners despite a flat tape. ".repeat(6)}`,
      ],
      bull: `Dips get bought. ${"Earnings breadth is still intact. ".repeat(6)}`,
      bear: `Highs on three stocks. ${"Volatility is not pricing the dispersion. ".repeat(6)}`,
      book: `Positioning is stretched. ${"Dealers are pinned into the strike. ".repeat(6)}`,
    };
    const f = facts({
      movers: fact([
        { ticker: "AKAM", changePct: -6.8 },
        { ticker: "SLB", changePct: -2.4 },
        { ticker: "MRNA", changePct: 4.1 },
      ]),
      attributions: fact([AKAM_ATTRIBUTION]),
      postMarket: fact([{ ticker: "AKAM", changePct: -3.1, asOfEt: "6:14pm" }]),
      macro: fact([
        {
          label: "Payrolls",
          period: "2026-07-01",
          timeEt: "8:30",
          actual: 256,
          prior: 142,
          priorRevised: true,
          suffix: "k",
          dp: 0,
          signed: true,
        },
      ]),
      ledger: {
        ...fact([
          {
            subject: "GC=F",
            comparator: "touch_above",
            threshold: 4300,
            noteDate: "2026-07-24",
            status: "miss" as const,
            resolvedValue: 4288.1,
          },
        ]),
        openCount: 3,
      },
    });

    const rungs = pushLadder({ facts: f, webUrl: "https://example.com/n", prose });
    expect(rungs.length).toBeGreaterThan(8);
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].length, `rung ${i} grew over rung ${i - 1}`).toBeLessThanOrEqual(rungs[i - 1].length);
    }
  });

  it("is monotonic on a day with no prose at all", () => {
    const f = facts({
      spotlight: fact([
        { key: "XLE", label: "Energy", headlinePct: 0.9, price: null, leaders: [], laggards: [], proxy: null },
        { key: "XLK", label: "Technology", headlinePct: -1.2, price: null, leaders: [], laggards: [], proxy: null },
      ]),
      movers: fact([{ ticker: "AKAM", changePct: -6.8 }]),
      attributions: fact([AKAM_ATTRIBUTION]),
      postMarket: fact([{ ticker: "AKAM", changePct: -3.1, asOfEt: "6:14pm" }]),
    });
    const rungs = pushLadder({ facts: f, webUrl: "https://example.com/n" });
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].length, `rung ${i} grew over rung ${i - 1}`).toBeLessThanOrEqual(rungs[i - 1].length);
    }
  });

  it("drops the ledger line before it touches any prose", () => {
    const prose: NoteProse = { hook: "A hook.", whatMatters: ["A claim. Its evidence."], bull: "Bull." };
    const f = facts({
      ledger: {
        ...fact([
          {
            subject: "GC=F",
            comparator: "touch_above",
            threshold: 4300,
            noteDate: "2026-07-24",
            status: "miss" as const,
            resolvedValue: 4288.1,
          },
        ]),
        openCount: 3,
      },
    });
    const rungs = pushLadder({ facts: f, webUrl: "https://example.com/n", prose });
    expect(rungs[0]).toContain("LEDGER");
    expect(rungs[1]).not.toContain("LEDGER");
    expect(rungs[1]).toContain("Bull.");
  });
});
