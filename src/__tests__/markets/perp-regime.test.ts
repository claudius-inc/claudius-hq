import { describe, it, expect } from "vitest";
import {
  efficiencyRatio,
  randomWalkEr,
  returnOver,
  ribbonState,
  classify,
  groupOf,
  summarizeRegime,
  REGIME_CONFIG,
  type RegimeInput,
} from "@/lib/markets/perp-regime";
import { renderRegime } from "@/lib/markets/convergence-message";
import type { PerpBar } from "@/lib/markets/perp-venues";

/** Bars from a close series. Anchored at a real epoch so quarterly VWAP runs. */
function barsFrom(closes: number[]): PerpBar[] {
  let t = Date.UTC(2025, 5, 1);
  return closes.map((c) => {
    const bar: PerpBar = {
      t,
      tClose: t + 14_400_000 - 1,
      o: c,
      h: c * 1.001,
      l: c * 0.999,
      c,
      v: 1000,
      q: 1000 * c,
    };
    t += 14_400_000;
    return bar;
  });
}

const ramp = (n: number, from = 100, step = 0.5) =>
  Array.from({ length: n }, (_, i) => from + i * step);

describe("efficiencyRatio", () => {
  it("scores a straight line at 1", () => {
    expect(efficiencyRatio(ramp(50), 40)).toBeCloseTo(1, 10);
  });

  it("scores a perfect zigzag near 0", () => {
    const zig = Array.from({ length: 41 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    expect(efficiencyRatio(zig, 40)).toBeCloseTo(0, 10);
  });

  it("returns null rather than shrinking the window", () => {
    // A shorter window has a HIGHER random-walk null, so quietly computing over
    // fewer bars would make thin names look more directional than deep ones.
    expect(efficiencyRatio(ramp(10), 40)).toBeNull();
  });

  it("is direction-blind — a fall is as efficient as a rise", () => {
    const up = ramp(50);
    const down = [...up].reverse();
    expect(efficiencyRatio(down, 40)).toBeCloseTo(efficiencyRatio(up, 40) as number, 10);
  });

  it("puts a random walk near its 1/sqrt(n) null", () => {
    // Deterministic pseudo-random, so a failure reproduces exactly.
    let s = 42;
    const rand = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
    const ratios: number[] = [];
    for (let trial = 0; trial < 200; trial++) {
      const closes = [100];
      for (let i = 1; i <= 181; i++) closes.push(closes[i - 1] + (rand() - 0.5));
      const er = efficiencyRatio(closes, 180);
      if (er !== null) ratios.push(er / randomWalkEr(180));
    }
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    // The null is an expectation, not an identity; 200 draws pin it loosely.
    expect(mean).toBeGreaterThan(0.5);
    expect(mean).toBeLessThan(1.6);
  });
});

describe("ribbonState", () => {
  it("reads a sustained rise as fully stacked", () => {
    expect(ribbonState(ramp(400))).toBe(1);
  });

  it("reads a sustained fall as fully inverted", () => {
    expect(ribbonState(ramp(400).reverse())).toBe(-1);
  });

  it("returns null before the slowest rung exists", () => {
    expect(ribbonState(ramp(50))).toBeNull();
  });

  it("reads a flat line as tangled, not stacked", () => {
    // Every EMA is equal, so no rung is strictly ordered either way.
    expect(ribbonState(new Array(400).fill(100))).toBe(0);
  });
});

describe("returnOver", () => {
  it("measures from n bars back to the last close", () => {
    expect(returnOver([100, 110, 120], 2)).toBeCloseTo(20, 10);
  });

  it("returns null when the history is short", () => {
    expect(returnOver([100, 110], 5)).toBeNull();
  });
});

describe("classify", () => {
  it("calls anything below the trend multiple crabbing, either direction", () => {
    expect(classify(9, REGIME_CONFIG.trendMultiple - 0.01)).toBe("crabbing");
    expect(classify(-9, REGIME_CONFIG.trendMultiple - 0.01)).toBe("crabbing");
  });

  it("takes the direction from the return once the move is efficient", () => {
    expect(classify(5, REGIME_CONFIG.trendMultiple)).toBe("uptrend");
    expect(classify(-5, REGIME_CONFIG.trendMultiple)).toBe("downtrend");
  });

  it("does not call a non-finite multiple a trend", () => {
    expect(classify(5, NaN)).toBe("crabbing");
  });
});

describe("groupOf", () => {
  it("splits crypto into majors and alts", () => {
    expect(groupOf("BTC", "crypto")).toBe("majors");
    expect(groupOf("PEPE", "crypto")).toBe("alts");
  });

  it("maps known equities to a sector", () => {
    expect(groupOf("NVDA", "equity")).toBe("semis");
    expect(groupOf("JPM", "equity")).toBe("financials");
  });

  it("keeps an unmapped equity rather than dropping it", () => {
    expect(groupOf("ZZZZ", "equity")).toBe("equity-other");
  });

  it("passes non-equity categories through unchanged", () => {
    expect(groupOf("XAU", "commodity")).toBe("commodity");
  });
});

describe("summarizeRegime", () => {
  const many = (base: string, category: "crypto" | "equity", closes: number[], n: number) =>
    Array.from({ length: n }, (_, i): RegimeInput => ({
      base: `${base}${i}`,
      category,
      bars: barsFrom(closes.map((c) => c * (1 + i / 1000))),
    }));

  it("drops groups below the minimum and keeps them out of the group list", () => {
    const s = summarizeRegime(
      [...many("ALT", "crypto", ramp(300), REGIME_CONFIG.minGroupN), ...many("NVDA", "equity", ramp(300), 1)],
      "2026-08-15T00:00:00.000Z",
    );
    expect(s.groups.map((g) => g.group)).toContain("alts");
    expect(s.groups.map((g) => g.group)).not.toContain("semis");
  });

  it("still counts a dropped group in the pooled universe", () => {
    const n = REGIME_CONFIG.minGroupN;
    const s = summarizeRegime(
      [...many("ALT", "crypto", ramp(300), n), ...many("NVDA", "equity", ramp(300), 1)],
      "2026-08-15T00:00:00.000Z",
    );
    expect(s.universe.n).toBe(n + 1);
  });

  it("ignores symbols without enough history instead of scoring them short", () => {
    const s = summarizeRegime(many("ALT", "crypto", ramp(50), 10), "2026-08-15T00:00:00.000Z");
    expect(s.universe.n).toBe(0);
    expect(s.groups).toHaveLength(0);
  });

  it("calls a clean rise an uptrend with the ribbon stacked", () => {
    const s = summarizeRegime(
      many("ALT", "crypto", ramp(300), REGIME_CONFIG.minGroupN),
      "2026-08-15T00:00:00.000Z",
    );
    expect(s.universe.label).toBe("uptrend");
    expect(s.universe.erMultiple).toBeGreaterThan(REGIME_CONFIG.trendMultiple);
    expect(s.universe.ribbonUpPct).toBe(100);
    expect(s.universe.ribbonDownPct).toBe(0);
  });
});

describe("renderRegime", () => {
  const group = (name: string, over: Partial<Record<string, number>> = {}) => ({
    group: name,
    n: 20,
    ret7: (over.ret7 as number) ?? 2.2,
    ret30: (over.ret30 as number) ?? 2.2,
    er30: 0.067,
    erMultiple: (over.erMultiple as number) ?? 0.9,
    ribbonUpPct: 70,
    ribbonDownPct: 5,
    aboveVwapPct: 76,
    label: "crabbing" as const,
  });

  const summary = (groups: ReturnType<typeof group>[], universeMult = 0.9) => ({
    groups,
    universe: { ...group("universe"), erMultiple: universeMult, label: universeMult >= REGIME_CONFIG.trendMultiple ? ("uptrend" as const) : ("crabbing" as const) },
    asOf: "2026-08-15T00:00:00.000Z",
  });

  it("renders nothing when there is no regime", () => {
    expect(renderRegime(null)).toEqual([]);
    expect(renderRegime(summary([]))).toEqual([]);
  });

  it("keeps every line inside the phone line budget", () => {
    const lines = renderRegime(summary([group("alts"), group("semis"), group("tech")]));
    // The trailing spacer and any italic caveat are not column-formatted rows.
    for (const l of lines.filter((x) => x.startsWith("   "))) {
      expect(l.length).toBeLessThanOrEqual(30);
    }
  });

  it("orders the spine ahead of everything else, whatever the group sizes", () => {
    const big = { ...group("commodity"), n: 999 };
    const body = renderRegime(summary([big, group("semis"), group("majors")]))
      .filter((l) => l.startsWith("   "))
      .join("\n");
    // Position, not line index — groups are now paired two to a line, so which
    // line a group lands on is a layout detail and the ORDER is the contract.
    expect(body.indexOf("majors")).toBeLessThan(body.indexOf("semis"));
    expect(body.indexOf("semis")).toBeLessThan(body.indexOf("cmdty"));
  });

  it("pairs groups two to a line so no column alignment is needed", () => {
    const lines = renderRegime(summary([group("majors"), group("alts"), group("semis")]));
    const bodies = lines.filter((l) => l.startsWith("   "));
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain("majors");
    expect(bodies[0]).toContain("alts");
    expect(bodies[1]).toContain("semis");
  });

  it("captions the horizon once, in the header, so it covers both lines", () => {
    const lines = renderRegime(
      summary([group("majors"), group("alts"), group("semis"), group("tech")]),
    );
    expect(lines[0]).toContain("7d");
    for (const body of lines.filter((l) => l.startsWith("   "))) {
      expect(body).not.toContain("7d");
    }
  });

  it("renders an arrow rather than NaN when a group scored no return", () => {
    const lines = renderRegime(summary([group("alts", { ret7: NaN })])).join("\n");
    expect(lines).not.toContain("NaN");
    expect(lines).toContain("→");
  });

  it("calls a move inside the flat band flat rather than asserting a direction", () => {
    const flat = renderRegime(summary([group("alts", { ret7: 0.4 })])).join("\n");
    expect(flat).toContain("→");
    expect(flat).not.toContain("↗");
    expect(flat).not.toContain("↘");
  });

  it("hides the residual bucket", () => {
    const lines = renderRegime(summary([group("equity-other"), group("semis")]));
    expect(lines.join("\n")).not.toContain("equity-other");
    expect(lines.join("\n")).toContain("semis");
  });

  it("caps the block so it cannot push the picks off the screen", () => {
    const lines = renderRegime(
      summary([
        group("majors"), group("alts"), group("semis"), group("tech"),
        group("commodity"), group("consumer"), group("industrial"),
      ]),
    );
    const bodies = lines.filter((l) => l.startsWith("   "));
    expect(bodies).toHaveLength(2);
    // The cap is on GROUPS, not lines — assert the thing that is capped.
    expect(bodies.join(" · ").split("·")).toHaveLength(4);
  });

  it("makes no claim about whether the ranking suits the tape", () => {
    // The block used to lead with a regime label and an efficiency multiple and
    // warn on a trending tape. Measured over 1,003 days, the multiple does not
    // predict the reversal ranking's daily IC at any window once the ER window
    // is embargoed off `rev6`'s own formation bars — family-wise p = 0.553. See
    // scripts/research/run-perp-regime-windows.ts and the docstring on
    // renderRegime. A trending tape must not resurrect the warning by accident.
    for (const mult of [0.9, 2.5]) {
      const lines = renderRegime(summary([group("alts")], mult)).join("\n");
      expect(lines).not.toContain("trending");
      expect(lines).not.toContain("coin flip");
      expect(lines).not.toContain("Crabbing");
      expect(lines).not.toContain("suits chop");
    }
  });

  it("carries direction in a glyph, because the percent it would duplicate is gone", () => {
    // The inverse of an earlier rule, and the rule itself is intact: a signed
    // percent BESIDE an arrow is two encodings of one quantity, which is why
    // `1d -8.0%` still carries no glyph. Here the percent was dropped, so the
    // arrow is the only encoding rather than a duplicate of one.
    const lines = renderRegime(summary([group("alts", { ret7: -6.9 })])).join("\n");
    expect(lines).toContain("↘");
    expect(lines).not.toContain("%");
  });
});
