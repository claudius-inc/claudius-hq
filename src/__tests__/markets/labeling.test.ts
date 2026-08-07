import { describe, it, expect } from "vitest";
import {
  findEntryIndex,
  entryPriceImplausible,
  seriesDisagree,
  labelPick,
  cohortStats,
  quarantineReasonFor,
  type LabelBar,
} from "@/lib/markets/labeling";

/** `n` daily bars from `start`, price rising by `pctPerBar`, adj == raw. */
function bars(n: number, start = 100, pctPerBar = 0, from = "2026-01-01"): LabelBar[] {
  const base = Date.parse(from);
  const out: LabelBar[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    out.push({
      d: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
      h: p * 1.02,
      l: p * 0.98,
      c: p,
      a: p,
    });
    p *= 1 + pctPerBar / 100;
  }
  return out;
}

const LATER = "2027-01-01"; // comfortably past every grace window below

describe("findEntryIndex", () => {
  const b = bars(5);
  it("finds an exact date", () => {
    expect(findEntryIndex(b, b[2].d)).toBe(2);
  });

  it("rolls forward when the ticker did not trade that day (exchange holiday)", () => {
    const gapped = [b[0], b[3], b[4]];
    expect(findEntryIndex(gapped, b[1].d)).toBe(1); // first bar on or after
  });

  it("returns -1 when no bar is on or after the date", () => {
    expect(findEntryIndex(b, "2030-01-01")).toBe(-1);
  });
});

describe("entryPriceImplausible", () => {
  const bar: LabelBar = { d: "2026-01-05", h: 110, l: 90, c: 100, a: 100 };

  it("accepts a price inside the traded range", () => {
    expect(entryPriceImplausible(95, bar)).toBe(false);
    expect(entryPriceImplausible(108, bar)).toBe(false);
  });

  it("tolerates a stale intraday scan just outside the range", () => {
    // The stored price is an intraday scan the report accepts for up to 4 days,
    // so a small overshoot must NOT be treated as a defect.
    expect(entryPriceImplausible(118, bar)).toBe(false);
  });

  it("flags a price that could not have traded", () => {
    expect(entryPriceImplausible(400, bar)).toBe(true);
    expect(entryPriceImplausible(10, bar)).toBe(true);
  });

  it("is a no-op when there is no stored price or no bar", () => {
    expect(entryPriceImplausible(null, bar)).toBe(false);
    expect(entryPriceImplausible(100, undefined)).toBe(false);
  });
});

describe("seriesDisagree", () => {
  it("agrees when raw and adjusted move together", () => {
    const e: LabelBar = { d: "a", h: 0, l: 0, c: 100, a: 50 };
    const x: LabelBar = { d: "b", h: 0, l: 0, c: 110, a: 55 };
    expect(seriesDisagree(e, x).disagree).toBe(false); // both +10%
  });

  it("tolerates a dividend-sized divergence", () => {
    const e: LabelBar = { d: "a", h: 0, l: 0, c: 100, a: 100 };
    const x: LabelBar = { d: "b", h: 0, l: 0, c: 100, a: 103 };
    expect(seriesDisagree(e, x).disagree).toBe(false);
  });

  it("flags an unadjusted split: raw collapses while adjusted does not", () => {
    // 10:1 split — raw shows -90%, adjusted shows ~0%.
    const e: LabelBar = { d: "a", h: 0, l: 0, c: 1000, a: 100 };
    const x: LabelBar = { d: "b", h: 0, l: 0, c: 100, a: 100 };
    const r = seriesDisagree(e, x);
    expect(r.disagree).toBe(true);
    expect(r.rawPct).toBeCloseTo(-90, 5);
    expect(r.adjPct).toBeCloseTo(0, 5);
  });
});

describe("labelPick", () => {
  const base = { storedPrice: null, today: LATER };

  it("computes the return from the adjusted series", () => {
    const r = labelPick({ ...base, bars: bars(30, 100, 1), entryDate: "2026-01-01", horizon: 5 });
    expect(r.status).toBe("labeled");
    expect(r.fwdPct).toBeCloseTo((1.01 ** 5 - 1) * 100, 6);
  });

  it("is split-invariant: a k:1 split in BOTH legs cancels", () => {
    // Adjusted series is continuous; raw halves at the split. Because the
    // return uses adjusted only, the label is unaffected.
    const b = bars(30, 100, 1);
    for (let i = 10; i < b.length; i++) b[i] = { ...b[i], c: b[i].c / 2 };
    const clean = labelPick({ ...base, bars: bars(30, 100, 1), entryDate: "2026-01-01", horizon: 5 });
    const split = labelPick({ ...base, bars: b, entryDate: "2026-01-01", horizon: 5 });
    expect(split.fwdPct).toBeCloseTo(clean.fwdPct!, 8);
  });

  it("uses trading-day positions, not calendar days", () => {
    // Bars here are consecutive array positions regardless of gaps: dropping
    // days must not change which bar is the exit.
    const b = bars(30).filter((_, i) => i % 3 !== 0); // punch holes
    const r = labelPick({ ...base, bars: b, entryDate: b[0].d, horizon: 5 });
    expect(r.exitDate).toBe(b[5].d);
  });

  it("stays pending while the forward window has not elapsed", () => {
    const b = bars(3);
    const r = labelPick({ bars: b, entryDate: b[0].d, horizon: 20, storedPrice: null, today: b[2].d });
    expect(r.status).toBe("pending");
    expect(r.fwdPct).toBeNull();
  });

  it("labels a delisting at the last available price and INCLUDES it", () => {
    // Excluding names that stopped trading is survivorship bias, and it
    // flatters the screen exactly where its picks did worst.
    const b = bars(4, 100, -20);
    const r = labelPick({ ...base, bars: b, entryDate: b[0].d, horizon: 20 });
    expect(r.status).toBe("partial_delist");
    expect(r.fwdPct).toBeLessThan(0);
    expect(r.anomalyNote).toContain("of 20 bars available");
  });

  it("reports no_data once the grace window passes with no bars at all", () => {
    const r = labelPick({ ...base, bars: [], entryDate: "2026-01-01", horizon: 5 });
    expect(r.status).toBe("no_data");
  });

  it("flags an unadjusted split as an anomaly and yields NO return", () => {
    const b = bars(30);
    for (let i = 3; i < b.length; i++) b[i] = { ...b[i], c: b[i].c / 10 };
    const r = labelPick({ ...base, bars: b, entryDate: b[0].d, horizon: 5 });
    expect(r.status).toBe("anomaly");
    expect(r.fwdPct).toBeNull();
    expect(r.anomalyNote).toContain("split or data defect");
  });

  it("does NOT flag a large genuine move", () => {
    // The whole point: magnitude is not evidence of a defect. A +80% week must
    // survive, or the right tail gets truncated out of every statistic.
    const b = bars(30, 100, 13); // ~+84% over 5 bars, raw and adj agree
    const r = labelPick({ ...base, bars: b, entryDate: b[0].d, horizon: 5 });
    expect(r.status).toBe("labeled");
    expect(r.fwdPct).toBeGreaterThan(60);
  });

  it("does NOT flag a large genuine LOSS", () => {
    const b = bars(30, 100, -13);
    const r = labelPick({ ...base, bars: b, entryDate: b[0].d, horizon: 5 });
    expect(r.status).toBe("labeled");
    expect(r.fwdPct).toBeLessThan(-40);
  });

  it("flags an entry price that never traded", () => {
    const b = bars(30);
    const r = labelPick({ ...base, bars: b, entryDate: b[0].d, horizon: 5, storedPrice: 9999 });
    expect(r.status).toBe("anomaly");
    expect(r.anomalyNote).toContain("outside traded range");
  });
});

describe("cohortStats", () => {
  it("includes delisted outcomes in the mean", () => {
    const s = cohortStats([
      { status: "labeled", fwdPct: 10 },
      { status: "partial_delist", fwdPct: -50 },
    ]);
    expect(s.n).toBe(2);
    expect(s.mean).toBeCloseTo(-20, 6);
  });

  it("excludes defect rows from the mean but counts them as attrition", () => {
    const s = cohortStats([
      { status: "labeled", fwdPct: 10 },
      { status: "anomaly", fwdPct: null },
      { status: "no_data", fwdPct: null },
    ]);
    expect(s.n).toBe(1);
    expect(s.mean).toBeCloseTo(10, 6);
    expect(s.attrition).toBeCloseTo(66.67, 1);
  });

  it("handles an all-defect cohort without dividing by zero", () => {
    const s = cohortStats([{ status: "no_data", fwdPct: null }]);
    expect(s.n).toBe(0);
    expect(s.mean).toBeNull();
    expect(s.attrition).toBe(100);
  });
});

describe("quarantineReasonFor", () => {
  it("quarantines confirmed split artifacts, temporarily", () => {
    const q = quarantineReasonFor("anomaly", "raw -90.0% vs adj 0.0% — split or data defect");
    expect(q?.reason).toBe("split_artifact");
    expect(q?.expiresInDays).toBe(60);
  });

  it("quarantines a stale feed", () => {
    expect(quarantineReasonFor("anomaly", "stored price 9999 outside traded range 98-102 on x")?.reason)
      .toBe("stale_feed");
  });

  it("quarantines a delisting permanently", () => {
    const q = quarantineReasonFor("no_data", "no bars");
    expect(q?.reason).toBe("delisted");
    expect(q?.expiresInDays).toBeNull();
  });

  it("does NOT quarantine a normal label", () => {
    expect(quarantineReasonFor("labeled", null)).toBeNull();
  });

  it("does NOT quarantine a brief halt that still produced a return", () => {
    // partial_delist can be a temporary halt; banning the ticker on that alone
    // would remove recoverable names.
    expect(quarantineReasonFor("partial_delist", "only 3 of 20 bars available")).toBeNull();
  });
});
