/**
 * `changeBetween` — the date-anchored window change behind §C's divergence
 * follow-through.
 *
 * The split guard is the part worth testing. `adjclose` is rewritten
 * retroactively by every split and dividend, so a corporate action inside the
 * window makes the adjusted and raw legs disagree — and over a few sessions that
 * disagreement is large enough to flip the sign of the answer. Returning null
 * there is what turns a wrong "the flag faded" into an honest "not checkable".
 */
import { describe, it, expect } from "vitest";
import { changeBetween, toYahooSymbol, type DailyBar } from "@/lib/notes/sources/daily-bars";

/** Bars where the raw and adjusted series may differ per date. */
function bars(rows: Record<string, [close: number, adjclose: number]>): Map<string, DailyBar> {
  return new Map(Object.entries(rows).map(([date, [close, adjclose]]) => [date, { date, close, adjclose }]));
}

/** Bars with no corporate action — raw and adjusted agree. */
function clean(prices: Record<string, number>): Map<string, DailyBar> {
  return bars(Object.fromEntries(Object.entries(prices).map(([d, p]) => [d, [p, p] as [number, number]])));
}

describe("toYahooSymbol", () => {
  it("converts SPDR share-class dots to Yahoo dashes", () => {
    expect(toYahooSymbol("BRK.B")).toBe("BRK-B");
    expect(toYahooSymbol("BF.B")).toBe("BF-B");
  });

  it("leaves an ordinary ticker alone", () => {
    expect(toYahooSymbol("AAPL")).toBe("AAPL");
  });
});

describe("changeBetween", () => {
  const b = clean({ "2026-08-03": 100, "2026-08-04": 102, "2026-08-05": 105, "2026-08-06": 110 });

  it("measures from the adjusted series between two specific dates", () => {
    expect(changeBetween(b, "2026-08-03", "2026-08-06", "AAA")).toBe(10);
    expect(changeBetween(b, "2026-08-04", "2026-08-05", "AAA")).toBeCloseTo(2.94, 2);
  });

  it("returns null when either endpoint has no bar — a date the name did not trade", () => {
    expect(changeBetween(b, "2026-07-31", "2026-08-06", "AAA")).toBeNull();
    expect(changeBetween(b, "2026-08-03", "2026-08-07", "AAA")).toBeNull();
  });

  it("returns null rather than dividing by a zero base", () => {
    expect(changeBetween(bars({ a: [0, 0], b: [10, 10] }), "a", "b", "AAA")).toBeNull();
  });

  it("returns 0 for a zero-length window rather than throwing", () => {
    // The caller must exclude these — a 0% relative move otherwise scores as
    // 'faded' for a flag that never had a window.
    expect(changeBetween(b, "2026-08-06", "2026-08-06", "AAA")).toBe(0);
  });

  it("omits the figure when a split makes the two series disagree", () => {
    // A 2-for-1 inside a 3-session window: raw halves, adjusted does not. The
    // legs disagree by far more than the tolerance, so the honest answer is
    // 'not checkable' rather than a fabricated -50%.
    const split = bars({
      "2026-08-03": [100, 50],
      "2026-08-04": [102, 51],
      "2026-08-05": [52, 52],
      "2026-08-06": [55, 55],
    });
    expect(changeBetween(split, "2026-08-03", "2026-08-06", "AAA")).toBeNull();
  });

  it("tolerates a dividend-sized disagreement over a short window", () => {
    // ~1% apart across 3 sessions sits inside the 2pp band the §D tolerance
    // allows for a short span, so the figure survives.
    const div = bars({
      "2026-08-03": [100, 99],
      "2026-08-04": [102, 101],
      "2026-08-05": [105, 104],
      "2026-08-06": [110, 110],
    });
    expect(changeBetween(div, "2026-08-03", "2026-08-06", "AAA")).not.toBeNull();
  });

  it("counts only the sessions the window spans, not the whole series", () => {
    // The tolerance scales with the span, so a long series must not push a
    // 2-session window into the wider 21-session band. Here the legs differ by
    // ~3pp — inside the long band, outside the short one — over two sessions.
    const long: Record<string, [number, number]> = {};
    for (let i = 1; i <= 40; i++) long[`2026-06-${String(i).padStart(2, "0")}`] = [100, 100];
    long["2026-07-01"] = [100, 100];
    long["2026-07-02"] = [103, 100];
    expect(changeBetween(bars(long), "2026-07-01", "2026-07-02", "AAA")).toBeNull();
  });
});
