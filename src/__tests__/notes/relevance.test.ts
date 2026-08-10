/**
 * The relevance score (v2 §A stage A) and the audit data behind it.
 *
 * The spec makes "review the coefficients against real output" a precondition
 * for stage B, so the components have to be both correct and inspectable. A
 * silently-wrong diagnostic is worse than no diagnostic: it would be read as
 * evidence.
 */
import { describe, it, expect } from "vitest";
import { rankRelevance, type RelevanceInput } from "@/lib/notes/relevance";

function name(over: Partial<RelevanceInput> & { ticker: string }): RelevanceInput {
  return {
    sectorEtf: "XLK",
    changePct: 1,
    sectorPct: 0,
    price: 100,
    volume: 10_000_000,
    avgVolume10d: 10_000_000,
    sectorWeight: 5,
    reportedToday: false,
    ...over,
  };
}

/** A universe big enough that percentiles and the union cap are meaningful. */
function universe(count: number): RelevanceInput[] {
  return Array.from({ length: count }, (_, i) =>
    name({
      ticker: `T${String(i).padStart(3, "0")}`,
      sectorEtf: ["XLK", "XLF", "XLE"][i % 3],
      changePct: (i % 11) - 5,
      sectorPct: 0.5,
      price: 10 + i,
      volume: 1_000_000 * (i + 1),
      sectorWeight: 1 + (i % 20),
    }),
  );
}

describe("rankRelevance", () => {
  it("returns nothing for an empty universe rather than throwing", () => {
    expect(rankRelevance([])).toEqual([]);
  });

  it("caps the union so the follow-on chart budget stays bounded", () => {
    // A tripwire on the constants rather than on the slice: with ROUTE_1_TOP +
    // ROUTE_2_TOP == UNION_CAP the cap cannot currently bite, so this fails only
    // if someone raises a route without raising the cap — which is exactly the
    // change that would blow the chart budget.
    expect(rankRelevance(universe(200)).length).toBeLessThanOrEqual(15);
  });

  it("carries every multiplicand, and they reproduce the score", () => {
    for (const s of rankRelevance(universe(120))) {
      const { liquidityDamp, bellwether, reason, dollarVolPct } = s.components;
      expect(liquidityDamp).toBeCloseTo(Math.sqrt(dollarVolPct), 10);
      expect(s.score).toBeCloseTo(s.gap * liquidityDamp * bellwether * reason, 10);
    }
  });

  it("keeps the liquidity damp strictly positive — sqrt(0) would annihilate, not damp", () => {
    // rank/(N+1) is what guarantees this; a plain rank/N gives the least liquid
    // name exactly 0 and deletes it from the ranking entirely.
    for (const s of rankRelevance(universe(60))) {
      expect(s.components.dollarVolPct).toBeGreaterThan(0);
      expect(s.components.liquidityDamp).toBeGreaterThan(0);
    }
  });

  it("never imputes a relative volume it does not have", () => {
    const scored = rankRelevance([
      name({ ticker: "AAA", avgVolume10d: null, changePct: 4 }),
      name({ ticker: "BBB", changePct: 3 }),
      name({ ticker: "CCC", changePct: 2 }),
    ]);
    expect(scored.find((s) => s.ticker === "AAA")?.components.rvolQ).toBe(1);
  });

  it("gives a reporting name the full reason multiplier", () => {
    const scored = rankRelevance([
      name({ ticker: "AAA", reportedToday: true, changePct: 4 }),
      name({ ticker: "BBB", changePct: 4 }),
      name({ ticker: "CCC", changePct: 4 }),
    ]);
    expect(scored.find((s) => s.ticker === "AAA")?.components.reason).toBe(1.75);
    expect(scored.find((s) => s.ticker === "BBB")?.components.reason).toBe(1);
  });

  it("caps the reason multiplier so a volume spike cannot outrun an actual report", () => {
    const scored = rankRelevance([
      name({ ticker: "AAA", volume: 900_000_000, avgVolume10d: 1_000_000, changePct: 4 }),
      name({ ticker: "BBB", changePct: 4 }),
      name({ ticker: "CCC", changePct: 4 }),
    ]);
    expect(scored.find((s) => s.ticker === "AAA")?.components.reason).toBe(1.75);
  });

  it("normalises the bellwether factor WITHIN sector, so it means the same across sectors", () => {
    // A top-heavy sector and a flat one, each with distinct weights so rank is
    // unambiguous. If the factor were relative to the sector's largest name, the
    // flat sector's mid-caps would sit far higher than the top-heavy sector's —
    // re-creating the cross-sector bias this module exists to remove.
    // Ten names total, so route 1's top-10 admits every one of them and the
    // union cap cannot silently drop the name under test.
    const topHeavy = [90, 4, 3, 2, 1].map((w, i) =>
      name({ ticker: `H${i}`, sectorEtf: "XLK", sectorWeight: w, changePct: 2 }),
    );
    const flat = [18.5, 18, 17.5, 17, 16.5].map((w, i) =>
      name({ ticker: `F${i}`, sectorEtf: "XLF", sectorWeight: w, changePct: 2 }),
    );
    const scored = rankRelevance([...topHeavy, ...flat]);
    expect(scored).toHaveLength(10);
    const bell = (t: string) => scored.find((s) => s.ticker === t)?.components.bellwether as number;
    // Same within-sector rank ⇒ same factor, whatever the sector's shape.
    for (let i = 0; i < 5; i++) {
      expect(bell(`H${i}`)).toBeCloseTo(bell(`F${i}`), 10);
    }
    // …and it still spans the intended [0.5, 1] band rather than collapsing.
    expect(bell("H0")).toBeGreaterThan(bell("H4"));
    expect(bell("H4")).toBeGreaterThanOrEqual(0.5);
    expect(bell("H0")).toBeLessThanOrEqual(1);
  });

  it("ranks ties identically, so DB row order cannot change the ranking", () => {
    // The percentile inputs are ordered by however the constituent rows came
    // back. If ties were split by arrival order, the evening's second run could
    // rank two equal names the other way round and edit a different set of
    // movers into the message that already went out.
    const equal = (tickers: string[]) =>
      tickers.map((t) => name({ ticker: t, sectorEtf: "XLK", sectorWeight: 5, volume: 5_000_000, changePct: 2 }));
    const forward = rankRelevance(equal(["AAA", "BBB", "CCC", "DDD"]));
    const reversed = rankRelevance(equal(["DDD", "CCC", "BBB", "AAA"]));
    const bellOf = (rs: typeof forward) =>
      Object.fromEntries(rs.map((s) => [s.ticker, s.components.bellwether]));
    const dvOf = (rs: typeof forward) =>
      Object.fromEntries(rs.map((s) => [s.ticker, s.components.dollarVolPct]));
    expect(bellOf(forward)).toEqual(bellOf(reversed));
    expect(dvOf(forward)).toEqual(dvOf(reversed));
    // All four are identical, so every factor must be too.
    expect(new Set(Object.values(bellOf(forward))).size).toBe(1);
    // …and pin the VALUE, not just the agreement. A tied block collapsing to 0
    // would satisfy every assertion above while reintroducing the sqrt(0)
    // annihilation the rank/(N+1) form exists to prevent. Four tied names span
    // ranks 1–4, average 2.5, over N+1 = 5.
    expect(Object.values(dvOf(forward))).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(Object.values(bellOf(forward))).toEqual([0.75, 0.75, 0.75, 0.75]);
  });

  it("orders the result deterministically when scores tie", () => {
    // Same reason: the emitted set AND its order must not depend on row order,
    // because the second run of the evening re-renders the sent message.
    const equal = (tickers: string[]) =>
      tickers.map((t) => name({ ticker: t, sectorEtf: "XLK", sectorWeight: 5, changePct: 2 }));
    const forward = rankRelevance(equal(["DDD", "AAA", "CCC", "BBB"])).map((s) => s.ticker);
    const reversed = rankRelevance(equal(["BBB", "CCC", "AAA", "DDD"])).map((s) => s.ticker);
    expect(forward).toEqual(reversed);
    expect(forward).toEqual(["AAA", "BBB", "CCC", "DDD"]);
  });

  it("leaves the bellwether factor neutral for a sector with no stored weights", () => {
    const scored = rankRelevance([
      name({ ticker: "AAA", sectorEtf: "XLU", sectorWeight: null, changePct: 3 }),
      name({ ticker: "BBB", sectorEtf: "XLU", sectorWeight: null, changePct: 2 }),
      name({ ticker: "CCC", sectorEtf: "XLK", sectorWeight: 4, changePct: 2 }),
    ]);
    expect(scored.find((s) => s.ticker === "AAA")?.components.bellwether).toBe(0.75);
  });

  it("admits a big liquid mover by route 2 even when its gap is ~0", () => {
    // The case route 2 exists for: a mega-cap whose move IS its sector's move
    // scores near zero on a gap-led formula and would otherwise be invisible.
    const inputs = [
      ...universe(40),
      name({
        ticker: "MEGA",
        sectorEtf: "XLK",
        changePct: -9,
        sectorPct: -9, // gap of exactly 0
        price: 500,
        volume: 40_000_000, // $20bn, far above the floor
        sectorWeight: 20,
      }),
    ];
    const mega = rankRelevance(inputs).find((s) => s.ticker === "MEGA");
    expect(mega).toBeDefined();
    expect(mega?.gap).toBe(0);
    expect(mega?.route).toBe("move");
  });

  it("keeps an illiquid big mover out of route 2", () => {
    const inputs = [
      ...universe(40),
      name({ ticker: "THIN", changePct: -30, sectorPct: -30, price: 1, volume: 1000 }),
    ];
    expect(rankRelevance(inputs).find((s) => s.ticker === "THIN")?.route).not.toBe("move");
  });
});
