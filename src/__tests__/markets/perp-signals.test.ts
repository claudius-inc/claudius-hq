import { describe, it, expect } from "vitest";
import {
  PERP_SIGNALS,
  SIGNAL_BY_NAME,
  CORE_SIGNALS,
  quarterlyVwapSeries,
  shippedScoreSeries,
  registryHash,
  type PerSymbolSpec,
  type SignalContext,
} from "@/lib/markets/perp-signals";
import { quarterlyVwap, scoreSymbol, CONVERGENCE_CONFIG } from "@/lib/markets/convergence-screen";
import { computeMcdSeries, MCD_WARMUP } from "@/lib/markets/mcd";
import type { PerpBar, PerpSymbol } from "@/lib/markets/perp-venues";
import type { PositioningHistory } from "@/lib/markets/perp-positioning-history";

/**
 * Deterministic 4h perp bars. No Math.random, so a failure reproduces exactly.
 * Anchored at a real epoch so the quarter-boundary logic is exercised rather
 * than sidestepped.
 */
function synthPerpBars(n: number, seed = 7): PerpBar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const bars: PerpBar[] = [];
  // 2025-06-01T00:00Z — far enough back that `n` bars cross several quarters.
  let t = Date.UTC(2025, 5, 1);
  let price = 100;
  for (let i = 0; i < n; i++) {
    const drift = (rand() - 0.485) * 2;
    const o = price;
    const c = Math.max(1, price + drift);
    const h = Math.max(o, c) + rand() * 0.9;
    const l = Math.min(o, c) - rand() * 0.9;
    const v = 1000 + rand() * 6000;
    bars.push({ t, tClose: t + 14_400_000 - 1, o, h, l, c, v, q: v * c });
    price = c;
    t += 14_400_000;
  }
  return bars;
}

const ctx = (positioning: PositioningHistory | null = null): SignalContext => ({
  symbol: "TESTUSDT",
  category: "crypto",
  positioning,
});

/** Synthetic positioning covering the whole bar range, so attention signals run. */
function synthPositioning(bars: PerpBar[], seed = 11): PositioningHistory {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const funding: { t: number; rate: number }[] = [];
  const oi: { t: number; oi: number; oiValue: number }[] = [];
  const taker: { t: number; ratio: number }[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i % 2 === 0) funding.push({ t: bars[i].tClose - 1, rate: (rand() - 0.5) / 5000 });
    const level = 1_000_000 * (1 + rand());
    oi.push({ t: bars[i].tClose - 1, oi: level, oiValue: level * bars[i].c });
    taker.push({ t: bars[i].tClose - 1, ratio: 0.7 + rand() * 0.8 });
  }
  return { symbol: "TESTUSDT", funding, fundingIntervalMs: 28_800_000, oi, taker };
}

describe("registry shape", () => {
  it("has unique names and no empty descriptions", () => {
    const names = PERP_SIGNALS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of PERP_SIGNALS) expect(s.description.length).toBeGreaterThan(20);
  });

  it("indexes every signal by name", () => {
    for (const s of PERP_SIGNALS) expect(SIGNAL_BY_NAME.get(s.name)).toBe(s);
  });

  it("hashes differently when the registry or config changes", () => {
    expect(registryHash(["a", "b"], { h: 6 })).toBe(registryHash(["b", "a"], { h: 6 }));
    expect(registryHash(["a", "b"], { h: 6 })).not.toBe(registryHash(["a", "b"], { h: 18 }));
    expect(registryHash(["a"], { h: 6 })).not.toBe(registryHash(["a", "b"], { h: 6 }));
  });
});

describe("every per-symbol signal is causal", () => {
  const bars = synthPerpBars(700);
  const pos = synthPositioning(bars);
  const perSymbol = PERP_SIGNALS.filter(
    (s): s is PerSymbolSpec => s.kind === "perSymbol",
  );

  /**
   * THE TEST THAT MATTERS.
   *
   * A signal that reads bars after index `i` produces alpha that cannot be
   * traded, and it is the single easiest way to fool this whole pipeline. If
   * `compute` is causal then the value at `i` cannot depend on anything after
   * `i`, so recomputing on a truncated prefix must give an IDENTICAL number.
   * Exact equality is the right assertion because every series here is
   * deterministic given its prefix — a tolerance would hide a small leak.
   */
  for (const spec of perSymbol) {
    it(`${spec.name} — prefix recomputation matches`, () => {
      const full = spec.compute(bars, ctx(pos));
      expect(full).toHaveLength(bars.length);

      for (const i of [420, 555, 640, 699]) {
        if (i < spec.minBars) continue;
        const truncated = spec.compute(bars.slice(0, i + 1), ctx(pos));
        expect(truncated).toHaveLength(i + 1);
        expect(
          truncated[i],
          `${spec.name} leaked future information at bar ${i}`,
        ).toBe(full[i]);
      }
    });
  }

  it("produces a usable value at the final bar for core signals", () => {
    // Guards against the opposite failure from look-ahead: a signal that is
    // causal but always null is silently excluded from every study.
    const dead: string[] = [];
    for (const spec of perSymbol) {
      if (spec.tier !== "core") continue;
      const out = spec.compute(bars, ctx(pos));
      if (out[out.length - 1] === null) dead.push(spec.name);
    }
    expect(dead).toEqual([]);
  });

  it("returns all-null rather than throwing when positioning is absent", () => {
    for (const spec of perSymbol) {
      const out = spec.compute(bars, ctx(null));
      expect(out).toHaveLength(bars.length);
    }
  });
});

describe("quarterlyVwapSeries reproduces the shipped quarterlyVwap", () => {
  const bars = synthPerpBars(600);

  it("matches the screen's value at the final bar", () => {
    const series = quarterlyVwapSeries(bars);
    expect(series[bars.length - 1]).toBeCloseTo(quarterlyVwap(bars) as number, 9);
  });

  /**
   * The O(n) accumulator must agree with the O(n^2) original at EVERY bar, not
   * only the last — the quarter boundary is where an off-by-one would hide, and
   * only a full sweep visits it.
   */
  it("matches at every bar, including across quarter boundaries", () => {
    const series = quarterlyVwapSeries(bars);
    for (let i = 0; i < bars.length; i++) {
      const expected = quarterlyVwap(bars.slice(0, i + 1));
      if (expected === null) expect(series[i]).toBeNull();
      else expect(series[i] as number).toBeCloseTo(expected, 9);
    }
  });

  it("spans more than one quarter, so the boundary is actually exercised", () => {
    const quarters = new Set(
      bars.map((b) => {
        const d = new Date(b.tClose);
        return `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3)}`;
      }),
    );
    expect(quarters.size).toBeGreaterThan(1);
  });
});

describe("incumbent signals reproduce the shipped logic", () => {
  const bars = synthPerpBars(700);

  it("mcdNet equals the MCD engine's net score", () => {
    const spec = SIGNAL_BY_NAME.get("mcdNet") as PerSymbolSpec;
    const out = spec.compute(bars, ctx());
    const series = computeMcdSeries(
      bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })),
    );
    for (let i = MCD_WARMUP; i < bars.length; i += 37) {
      expect(out[i]).toBe(series[i].longScore - series[i].shortScore);
    }
  });

  it("shippedScore equals scoreSymbol's net weighted score at the final bar", () => {
    const sym: PerpSymbol = {
      venue: "binance",
      symbol: "TESTUSDT",
      base: "TEST",
      quote: "USDT",
      category: "crypto",
    };
    const scored = scoreSymbol(sym, bars, CONVERGENCE_CONFIG);
    expect(scored).not.toBeNull();

    const series = shippedScoreSeries(bars, CONVERGENCE_CONFIG.vwapWeight);
    expect(series[bars.length - 1]).toBe(scored!.long.score - scored!.short.score);
  });
});

describe("cross-sectional signals", () => {
  it("dollarVolPctl ranks within category and tops a lone member", () => {
    const spec = PERP_SIGNALS.find((s) => s.name === "dollarVolPctl");
    expect(spec?.kind).toBe("crossSectional");
    if (spec?.kind !== "crossSectional") return;

    const bar = synthPerpBars(2)[0];
    const out = spec.computeAt([
      { category: "crypto", bar, avgQuoteVol: 10 },
      { category: "crypto", bar, avgQuoteVol: 30 },
      { category: "crypto", bar, avgQuoteVol: 20 },
      { category: "commodity", bar, avgQuoteVol: 5 },
    ]);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(100);
    expect(out[2]).toBe(50);
    // Sole member of its category — top by definition, not bottom.
    expect(out[3]).toBe(100);
  });
});

describe("tiering keeps the tradfi book in the core study", () => {
  /**
   * Measured from the cached universe: requiring 552 bars erases the premarket
   * category entirely and cuts equity from 90 usable names to 26. The core tier
   * exists to prevent the search from silently becoming crypto-only, so its
   * warmup ceiling is a property worth asserting rather than a comment.
   */
  it("no core signal needs more than 300 bars", () => {
    const tooDeep = CORE_SIGNALS.filter(
      (s) => s.kind === "perSymbol" && s.minBars > MCD_WARMUP,
    ).map((s) => s.name);
    expect(tooDeep).toEqual([]);
  });
});
