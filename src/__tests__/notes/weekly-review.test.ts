/**
 * THE WEEK REVIEWED (v2 §C) — the wrap's accountability tier.
 *
 * The failure mode this guards is not a crash, it is flattery: a denominator
 * that quietly shrinks to whatever resolved, a cap that drops the misses, a
 * section that reads as a verdict. Each test below pins one of those shut.
 *
 * `fetchDailyBars` is stubbed per test so the follow-through logic is exercised
 * for real; `changeBetween` and `toYahooSymbol` come from the actual module, so
 * the arithmetic under test is the shipped arithmetic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDailyBars } from "@/lib/notes/sources/daily-bars";
import { buildWeeklyReview, type ReviewDay, type WeeklyReview } from "@/lib/notes/weekly-review";
import { weeklyLadder, renderWeeklyPush, renderWeeklyWeb } from "@/lib/notes/render-weekly";
import type { StructuredFacts, NoteProse } from "@/lib/notes/types";
import type { WeeklyFacts } from "@/lib/notes/weekly";

vi.mock("@/lib/notes/sources/daily-bars", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notes/sources/daily-bars")>();
  return { ...actual, fetchDailyBars: vi.fn(async () => new Map()) };
});

const fact = <T,>(value: T) => ({ value, source: "test", asOf: "2026-08-07T20:00:00Z" });

function facts(partial: Partial<StructuredFacts> = {}): StructuredFacts {
  return {
    date: "2026-08-07",
    generatedAt: "2026-08-07T22:15:00Z",
    indices: null,
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

const day = (date: string, f: Partial<StructuredFacts>, prose: NoteProse | null = null): ReviewDay => ({
  date,
  facts: facts({ ...f, date }),
  prose,
});

const pinFact = (spot: number, pinStrike: number) =>
  fact({ symbol: "SPY", spot, pinStrike, netGammaPositive: true, distancePct: 0, expiriesUsed: 3 });

/** A bar series where every date carries `price[date]`, raw == adjusted. */
function bars(prices: Record<string, number>) {
  return new Map(
    Object.entries(prices).map(([date, p]) => [date, { date, close: p, adjclose: p }]),
  );
}

/** Route each symbol to its own series; anything unlisted comes back empty. */
function stubBars(bySymbol: Record<string, Map<string, { date: string; close: number; adjclose: number }>>) {
  vi.mocked(fetchDailyBars).mockImplementation(async (symbol: string) => bySymbol[symbol] ?? new Map());
}

const divergenceFact = (etf: string, names: { ticker: string; gap: number }[]) =>
  fact([
    {
      etf,
      sectorName: etf,
      sectorChangePct: -1.5,
      direction: "down" as const,
      names: names.map((n) => ({ ticker: n.ticker, name: null, changePct: 1, gap: n.gap })),
    },
  ]);

describe("divergence follow-through", () => {
  beforeEach(() => {
    vi.mocked(fetchDailyBars).mockReset();
    vi.mocked(fetchDailyBars).mockImplementation(async () => new Map());
  });

  it("resolves a flag against its SECTOR, not in isolation", async () => {
    // The claim was relative — "green in a red sector" — so a name that rose
    // less than its sector did NOT keep its direction, even though it rose.
    stubBars({
      AAA: bars({ "2026-08-04": 100, "2026-08-05": 101, "2026-08-06": 102 }),
      XLF: bars({ "2026-08-04": 100, "2026-08-05": 103, "2026-08-06": 108 }),
    });
    const days = [day("2026-08-04", { divergence: divergenceFact("XLF", [{ ticker: "AAA", gap: 2.1 }]) })];
    const r = await buildWeeklyReview(days, facts(), "2026-08-06", "2026-07-31");
    expect(r.followThrough?.names[0]).toMatchObject({ namePct: 2, sectorPct: 8, kept: false });
    expect(r.followThrough).toMatchObject({ flagged: 1, checkable: 1, kept: 0 });
  });

  it("counts a flag as kept when the relative move keeps the sign of the gap", async () => {
    stubBars({
      AAA: bars({ "2026-08-04": 100, "2026-08-06": 110 }),
      XLF: bars({ "2026-08-04": 100, "2026-08-06": 102 }),
    });
    const days = [day("2026-08-04", { divergence: divergenceFact("XLF", [{ ticker: "AAA", gap: 2.1 }]) })];
    const r = await buildWeeklyReview(days, facts(), "2026-08-06", "2026-07-31");
    expect(r.followThrough).toMatchObject({ checkable: 1, kept: 1 });
  });

  it("handles a NEGATIVE gap — relative weakness that persisted", async () => {
    stubBars({
      AAA: bars({ "2026-08-04": 100, "2026-08-06": 95 }),
      XLE: bars({ "2026-08-04": 100, "2026-08-06": 101 }),
    });
    const days = [day("2026-08-04", { divergence: divergenceFact("XLE", [{ ticker: "AAA", gap: -2.4 }]) })];
    const r = await buildWeeklyReview(days, facts(), "2026-08-06", "2026-07-31");
    expect(r.followThrough).toMatchObject({ checkable: 1, kept: 1 });
  });

  it("keeps a flag made on the closing session in the denominator but out of checkable", async () => {
    // No window to measure. Dropping it from `flagged` too would let the ratio
    // improve simply by flagging things late — and scoring it would be worse
    // still: a bar against itself is a 0% relative move, which reads as faded.
    stubBars({ AAA: bars({ "2026-08-06": 100 }), XLF: bars({ "2026-08-06": 100 }) });
    const days = [day("2026-08-06", { divergence: divergenceFact("XLF", [{ ticker: "AAA", gap: 2.1 }]) })];
    const r = await buildWeeklyReview(days, facts(), "2026-08-06", "2026-07-31");
    expect(r.followThrough).toMatchObject({ flagged: 1, checkable: 0, kept: 0 });
  });

  it("counts a flag whose sector leg is missing as unresolved, never as absolute", async () => {
    stubBars({ AAA: bars({ "2026-08-04": 100, "2026-08-06": 110 }) }); // no XLF
    const days = [day("2026-08-04", { divergence: divergenceFact("XLF", [{ ticker: "AAA", gap: 2.1 }]) })];
    const r = await buildWeeklyReview(days, facts(), "2026-08-06", "2026-07-31");
    expect(r.followThrough).toMatchObject({ flagged: 1, checkable: 0 });
    expect(r.followThrough?.names).toEqual([]);
  });

  it("reports a total fetch failure as a count, not as an absent section", async () => {
    stubBars({}); // every symbol comes back empty
    const days = [
      day("2026-08-04", {
        divergence: divergenceFact("XLF", [
          { ticker: "AAA", gap: 2.1 },
          { ticker: "BBB", gap: 1.7 },
        ]),
      }),
    ];
    const r = await buildWeeklyReview(days, facts(), "2026-08-06", "2026-07-31");
    expect(r.followThrough).toMatchObject({ flagged: 2, checkable: 0 });
  });

  it("follows a repeated flag from its FIRST appearance", async () => {
    // Re-registering daily would weight a persistent divergence above a sharp
    // one, and would measure a shorter window than the claim actually spanned.
    stubBars({
      AAA: bars({ "2026-08-04": 100, "2026-08-05": 105, "2026-08-06": 110 }),
      XLF: bars({ "2026-08-04": 100, "2026-08-05": 100, "2026-08-06": 100 }),
    });
    const days = [
      day("2026-08-04", { divergence: divergenceFact("XLF", [{ ticker: "AAA", gap: 2.1 }]) }),
      day("2026-08-05", { divergence: divergenceFact("XLF", [{ ticker: "AAA", gap: 1.4 }]) }),
    ];
    const r = await buildWeeklyReview(days, facts(), "2026-08-06", "2026-07-31");
    expect(r.followThrough?.flagged).toBe(1);
    expect(r.followThrough?.names[0]).toMatchObject({ flaggedOn: "2026-08-04", gapAtFlag: 2.1, namePct: 10 });
  });

  it("scopes to the sharpest sector only — the one the push actually printed", async () => {
    const twoSectors = fact([
      {
        etf: "XLF",
        sectorName: "XLF",
        sectorChangePct: -2.5,
        direction: "down" as const,
        names: [{ ticker: "AAA", name: null, changePct: 1, gap: 3.5 }],
      },
      {
        etf: "XLE",
        sectorName: "XLE",
        sectorChangePct: -1,
        direction: "down" as const,
        names: [{ ticker: "BBB", name: null, changePct: 1, gap: 2 }],
      },
    ]);
    stubBars({
      AAA: bars({ "2026-08-04": 100, "2026-08-06": 110 }),
      BBB: bars({ "2026-08-04": 100, "2026-08-06": 110 }),
      XLF: bars({ "2026-08-04": 100, "2026-08-06": 100 }),
      XLE: bars({ "2026-08-04": 100, "2026-08-06": 100 }),
    });
    const r = await buildWeeklyReview([day("2026-08-04", { divergence: twoSectors })], facts(), "2026-08-06", "2026-07-31");
    expect(r.followThrough?.names.map((n) => n.ticker)).toEqual(["AAA"]);
  });

  it("maps a share-class ticker to Yahoo's spelling before fetching", async () => {
    stubBars({
      "BRK-B": bars({ "2026-08-04": 100, "2026-08-06": 110 }),
      XLF: bars({ "2026-08-04": 100, "2026-08-06": 100 }),
    });
    const days = [day("2026-08-04", { divergence: divergenceFact("XLF", [{ ticker: "BRK.B", gap: 2.1 }]) })];
    const r = await buildWeeklyReview(days, facts(), "2026-08-06", "2026-07-31");
    expect(r.followThrough?.names[0]).toMatchObject({ ticker: "BRK.B", kept: true });
  });
});

describe("gamma-pin adherence", () => {
  it("measures the next close against the PRIOR session's pin, anchor included", async () => {
    const start = facts({ gexPin: pinFact(600, 600) });
    const days = [day("2026-08-04", { gexPin: pinFact(603, 600) }), day("2026-08-05", { gexPin: pinFact(618, 600) })];
    const r = await buildWeeklyReview(days, start, "2026-08-05", "2026-07-31");
    expect(r.pin?.checkable).toBe(2);
    // anchor pin 600 → next close 603 = +0.5% (near); day-1 pin 600 → 618 = +3%.
    expect(r.pin?.overnights.map((o) => o.distancePct)).toEqual([0.5, 3]);
    expect(r.pin?.near).toBe(1);
  });

  it("states the true denominator when only some overnights carried a pin", async () => {
    // anchor→Tue has a pin on the anchor but none on Tue; Tue→Wed has none on
    // Tue. Only Wed→Thu is a complete pair, out of three the week offered.
    const start = facts({ gexPin: pinFact(600, 600) });
    const days = [
      day("2026-08-04", {}),
      day("2026-08-05", { gexPin: pinFact(605, 600) }),
      day("2026-08-06", { gexPin: pinFact(612, 610) }),
    ];
    const r = await buildWeeklyReview(days, start, "2026-08-06", "2026-07-31");
    expect(r.pin).toMatchObject({ checkable: 1, total: 3 });
  });

  it("is omitted entirely when no overnight was checkable", async () => {
    const start = facts({ gexPin: pinFact(600, 600) });
    const days = [day("2026-08-04", {}), day("2026-08-05", { gexPin: pinFact(610, 600) })];
    const r = await buildWeeklyReview(days, start, "2026-08-05", "2026-07-31");
    expect(r.pin).toBeNull();
  });

  it("refuses to compare pins priced on different instruments", async () => {
    const start = facts({ gexPin: pinFact(600, 600) });
    const spx = fact({
      symbol: "SPX",
      spot: 6000,
      pinStrike: 6000,
      netGammaPositive: true,
      distancePct: 0,
      expiriesUsed: 3,
    });
    const r = await buildWeeklyReview([day("2026-08-04", { gexPin: spx })], start, "2026-08-04", "2026-07-31");
    expect(r.pin).toBeNull();
  });
});

describe("biggest single-day moves", () => {
  it("takes each name's largest day, so one name cannot fill every slot", async () => {
    const days = [
      day("2026-08-04", {
        movers: fact([
          { ticker: "AAA", changePct: -2 },
          { ticker: "BBB", changePct: 3 },
        ]),
      }),
      day("2026-08-05", {
        movers: fact([
          { ticker: "AAA", changePct: -9 },
          { ticker: "CCC", changePct: 4 },
        ]),
      }),
    ];
    const r = await buildWeeklyReview(days, facts(), "2026-08-05", "2026-07-31");
    expect(r.biggestMoves?.names.map((n) => n.ticker)).toEqual(["AAA", "CCC", "BBB"]);
    expect(r.biggestMoves?.names[0]).toMatchObject({ changePct: -9, date: "2026-08-05" });
  });

  it("reports how many sessions actually carried a ranking", async () => {
    const days = [day("2026-08-04", {}), day("2026-08-05", { movers: fact([{ ticker: "AAA", changePct: 5 }]) })];
    const r = await buildWeeklyReview(days, facts(), "2026-08-05", "2026-07-31");
    expect(r.biggestMoves).toMatchObject({ sessionsCovered: 1, totalSessions: 2 });
  });
});

describe("concentration", () => {
  const contribution = (topNames: string[], flips: boolean) =>
    fact({ modelledPct: -0.1, actualPct: -0.1, topNames, topPoints: -0.3, exTopPct: 0.2, flipsWithoutTop: flips });

  it("counts only the sessions whose reconciliation gate passed, against the total", async () => {
    const days = [
      day("2026-08-04", { contribution: contribution(["NVDA", "AAPL"], true) }),
      day("2026-08-05", {}),
      day("2026-08-06", { contribution: contribution(["NVDA", "MSFT"], false) }),
    ];
    const r = await buildWeeklyReview(days, facts(), "2026-08-06", "2026-07-31");
    expect(r.concentration).toMatchObject({ reconciledSessions: 2, totalSessions: 3, flipDays: 1 });
    // Only names appearing on more than one reconciled day are "recurring".
    expect(r.concentration?.recurring).toEqual([{ ticker: "NVDA", days: 2 }]);
  });

  it("is omitted entirely when no session reconciled — never 'concentration was normal'", async () => {
    const r = await buildWeeklyReview([day("2026-08-04", {})], facts(), "2026-08-04", "2026-07-31");
    expect(r.concentration).toBeNull();
  });
});

describe("volatility regime", () => {
  const vix = (percentile: number) =>
    fact({ level: 15, change: 0.2, ytdLow: 11, ytdHigh: 30, percentile, trendDays: 1, trendDir: "up" as const });

  it("reports the bands the endpoints crossed, and the direction", async () => {
    const r = await buildWeeklyReview([day("2026-08-05", { vix: vix(62) })], facts({ vix: vix(20) }), "2026-08-05", "2026-07-31");
    expect(r.vixRegime).toMatchObject({ startPercentile: 20, endPercentile: 62, direction: "up" });
    expect(r.vixRegime?.crossed).toEqual([25, 50]);
  });

  it("claims no crossing when the week stayed inside one band", async () => {
    const r = await buildWeeklyReview([day("2026-08-05", { vix: vix(40) })], facts({ vix: vix(30) }), "2026-08-05", "2026-07-31");
    expect(r.vixRegime?.crossed).toEqual([]);
  });
});

describe("quoting what we wrote", () => {
  it("quotes the EARLIEST session with prose — the claim the week had longest to answer", async () => {
    const days = [
      day("2026-08-04", {}, null),
      day("2026-08-05", {}, { hook: "Narrow tape.", whatMatters: [] }),
      day("2026-08-06", {}, { hook: "Later hook.", whatMatters: [] }),
    ];
    const r = await buildWeeklyReview(days, facts(), "2026-08-06", "2026-07-31");
    expect(r.quoted).toEqual({ date: "2026-08-05", hook: "Narrow tape." });
  });

  it("has nothing to quote when no session shipped prose", async () => {
    const r = await buildWeeklyReview([day("2026-08-04", {})], facts(), "2026-08-04", "2026-07-31");
    expect(r.quoted).toBeNull();
  });
});

// ── Rendering ───────────────────────────────────────────────────────────────

const review: WeeklyReview = {
  followThrough: {
    flagged: 6,
    checkable: 4,
    kept: 3,
    names: [
      { ticker: "ICE", sectorEtf: "XLF", flaggedOn: "2026-08-04", gapAtFlag: 2.1, namePct: 3.2, sectorPct: 0.4, kept: true },
      { ticker: "CME", sectorEtf: "XLF", flaggedOn: "2026-08-04", gapAtFlag: 1.8, namePct: -1.1, sectorPct: 0.4, kept: false },
      { ticker: "XOM", sectorEtf: "XLE", flaggedOn: "2026-08-05", gapAtFlag: -2.4, namePct: -3, sectorPct: 1.2, kept: true },
      { ticker: "SLB", sectorEtf: "XLE", flaggedOn: "2026-08-05", gapAtFlag: -1.6, namePct: -2, sectorPct: 1.2, kept: true },
    ],
  },
  pin: {
    checkable: 4,
    total: 5,
    near: 2,
    nearPct: 0.5,
    overnights: [{ pinnedOn: "2026-08-04", pinStrike: 600, nextClose: 603, distancePct: 0.5 }],
  },
  biggestMoves: {
    sessionsCovered: 5,
    totalSessions: 5,
    names: [{ ticker: "AKAM", changePct: -6.8, date: "2026-08-06" }],
  },
  concentration: { reconciledSessions: 4, totalSessions: 5, flipDays: 2, recurring: [{ ticker: "NVDA", days: 4 }] },
  vixRegime: { startPercentile: 20, endPercentile: 62, crossed: [25, 50], direction: "up" },
  quoted: { date: "2026-08-04", hook: "Narrow tape, wide spreads." },
};

function weeklyFacts(over: Partial<WeeklyFacts> = {}): WeeklyFacts {
  return {
    weekEnd: "2026-08-07",
    weekStart: "2026-07-31",
    sessions: 5,
    indices: [{ label: "S&P 500", changePct: 1.2 }],
    sectors: [
      { label: "Energy", changePct: 2.1 },
      { label: "Utilities", changePct: -1.4 },
    ],
    crossAsset: [{ label: "Gold", changePct: -1.1 }],
    rates: [{ label: "10Y", changeBp: 9 }],
    vix: { start: 14.9, end: 18.4 },
    breadth: { sessionsCovered: 5, negativeSessions: 3, cumulativeNet: -1200 },
    rotation: { firstHalfLeader: "Energy", secondHalfLeader: "Utilities", rotated: true },
    review,
    ...over,
  };
}

describe("THE WEEK REVIEWED rendering", () => {
  const url = "https://example.com/w";

  it("uses the section title the spec requires, not 'scorecard'", () => {
    const out = renderWeeklyPush(weeklyFacts(), url);
    expect(out).toContain("THE WEEK REVIEWED");
    expect(out.toLowerCase()).not.toContain("scorecard");
  });

  it("always prints the denominator, including the flags it could not check", () => {
    const out = renderWeeklyPush(weeklyFacts(), url);
    expect(out).toContain("3 of 4 checkable flags (of 6 flagged)");
    expect(out).toContain("2 of 4 (of 5 overnights)");
  });

  it("shows a faded flag, not just the ones that held", () => {
    const out = renderWeeklyPush(weeklyFacts(), url);
    expect(out).toContain("faded");
  });

  it("uses no scoring verb for the pin or the quote", () => {
    const out = renderWeeklyPush(weeklyFacts(), url).toLowerCase();
    for (const verb of ["correct", "right", "wrong", "predicted", "we called", "hit rate", "accuracy"]) {
      expect(out).not.toContain(verb);
    }
  });

  it("labels the biggest moves as surfaced names, not as the market's biggest", () => {
    expect(renderWeeklyPush(weeklyFacts(), url)).toContain("among the names the notes surfaced");
  });

  it("discloses that the VIX percentile is of this year's closes", () => {
    expect(renderWeeklyPush(weeklyFacts(), url)).toContain("percentile of this year's closes");
  });

  it("says so when flags existed but none could be checked", () => {
    const stuck: WeeklyReview = { ...review, followThrough: { flagged: 6, checkable: 0, kept: 0, names: [] } };
    const out = renderWeeklyPush(weeklyFacts({ review: stuck }), url);
    expect(out).toContain("none of 6 flags could be checked this week");
  });

  it("omits the whole section when nothing was checkable", () => {
    const empty: WeeklyReview = {
      followThrough: null,
      pin: null,
      biggestMoves: null,
      concentration: null,
      vixRegime: null,
      quoted: null,
    };
    expect(renderWeeklyPush(weeklyFacts({ review: empty }), url)).not.toContain("THE WEEK REVIEWED");
    expect(renderWeeklyPush(weeklyFacts({ review: null }), url)).not.toContain("THE WEEK REVIEWED");
  });

  it("lists every flag on the web, including ones the push had no room for", () => {
    const web = renderWeeklyWeb(weeklyFacts(), url);
    for (const t of ["ICE", "CME", "XOM", "SLB"]) expect(web).toContain(t);
    expect(web).toContain("2 further flags were not checkable");
  });
});

describe("weekly overflow ladder", () => {
  const url = "https://example.com/w";

  it("is monotonic — no rung renders longer than the rung before it", () => {
    const rungs = weeklyLadder(weeklyFacts(), url);
    expect(rungs.length).toBeGreaterThan(3);
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].length, `rung ${i} grew over rung ${i - 1}`).toBeLessThanOrEqual(rungs[i - 1].length);
    }
  });

  it("keeps the review's counts alive longer than any descriptive section", () => {
    const rungs = weeklyLadder(weeklyFacts(), url);
    const last = rungs[rungs.length - 1];
    const secondLast = rungs[rungs.length - 2];
    // Rotation goes before the review does.
    expect(secondLast).toContain("THE WEEK REVIEWED");
    expect(secondLast).not.toContain("Rotation");
    // Only the final rung gives up the review, and that is the last resort.
    expect(last).not.toContain("THE WEEK REVIEWED");
  });

  it("drops the per-flag detail before it drops the counts", () => {
    const rungs = weeklyLadder(weeklyFacts(), url);
    expect(rungs[0]).toContain("flagged Tue");
    expect(rungs[1]).not.toContain("flagged Tue");
    expect(rungs[1]).toContain("3 of 4 checkable flags");
  });

  it("drops the quoted hook with the detail, since a bare quote reads as a verdict", () => {
    const rungs = weeklyLadder(weeklyFacts(), url);
    expect(rungs[0]).toContain("Narrow tape, wide spreads.");
    expect(rungs[1]).not.toContain("Narrow tape, wide spreads.");
  });
});
