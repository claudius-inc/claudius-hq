import { describe, it, expect } from "vitest";
import {
  trueRange,
  calculateATR,
  calculateATH,
  calculateRVOL,
  calculateRR,
  findSwingLow,
  aggregateToWeekly,
  aggregateToMonthly,
  type OHLCV,
} from "@/lib/scanner/indicators";

const createBar = (
  high: number,
  low: number,
  close: number,
  volume: number = 1000,
  daysAgo: number = 0
): OHLCV => ({
  date: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  open: low + (high - low) * 0.5,
  high,
  low,
  close,
  volume,
});

describe("trueRange", () => {
  it("calculates TR when no previous close", () => {
    expect(trueRange(110, 100, null)).toBe(10);
  });

  it("calculates TR with previous close inside range", () => {
    expect(trueRange(110, 100, 105)).toBe(10); // h-l = 10
  });

  it("calculates TR with gap up", () => {
    expect(trueRange(120, 115, 100)).toBe(20); // h-pc = 20
  });

  it("calculates TR with gap down", () => {
    expect(trueRange(95, 90, 110)).toBe(20); // pc-l = 20
  });
});

describe("calculateATH", () => {
  it("returns null for empty data", () => {
    expect(calculateATH([])).toBeNull();
  });

  it("returns the maximum high", () => {
    const data: OHLCV[] = [
      createBar(100, 90, 95),
      createBar(110, 95, 105),
      createBar(105, 98, 102),
    ];
    expect(calculateATH(data)).toBe(110);
  });
});

describe("calculateRVOL", () => {
  it("returns null for insufficient data", () => {
    const data: OHLCV[] = [createBar(100, 90, 95, 1000)];
    expect(calculateRVOL(data, 10)).toBeNull();
  });

  it("calculates relative volume correctly", () => {
    const data: OHLCV[] = [
      ...Array.from({ length: 10 }, (_, i) => createBar(100, 90, 95, 1000, i)),
      createBar(100, 90, 95, 2000, 11), // current bar with 2x volume
    ];
    const rvol = calculateRVOL(data, 10);
    expect(rvol).toBe(2);
  });
});

describe("calculateRR", () => {
  it("returns null when price <= swingLow", () => {
    expect(calculateRR(90, 110, 100)).toBeNull();
  });

  it("returns null when price >= ath", () => {
    expect(calculateRR(110, 100, 90)).toBeNull();
  });

  it("calculates risk/reward ratio correctly", () => {
    // ATH = 100, price = 80, swingLow = 60
    // Upside = 100 - 80 = 20
    // Downside = 80 - 60 = 20
    // RR = 1.0
    expect(calculateRR(80, 100, 60)).toBe(1);

    // ATH = 100, price = 70, swingLow = 60
    // Upside = 100 - 70 = 30
    // Downside = 70 - 60 = 10
    // RR = 3.0
    expect(calculateRR(70, 100, 60)).toBe(3);
  });
});

describe("findSwingLow", () => {
  it("returns null for insufficient data", () => {
    const data: OHLCV[] = [createBar(100, 90, 95)];
    expect(findSwingLow(data, 20)).toBeNull();
  });

  it("finds the lowest low in lookback period", () => {
    const data: OHLCV[] = Array.from({ length: 20 }, (_, i) =>
      createBar(100 + i, 80 + i, 90 + i, 1000, i)
    );
    // Oldest bar has low of 80
    const swingLow = findSwingLow(data, 20);
    expect(swingLow).toBe(80);
  });
});

describe("aggregateToWeekly", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateToWeekly([])).toEqual([]);
  });

  it("aggregates daily bars to weekly", () => {
    // Create 7 days of data (one week + 2 days)
    const data: OHLCV[] = [
      { date: new Date("2024-01-01"), open: 100, high: 105, low: 98, close: 102, volume: 1000 },
      { date: new Date("2024-01-02"), open: 102, high: 108, low: 100, close: 106, volume: 1200 },
      { date: new Date("2024-01-03"), open: 106, high: 110, low: 104, close: 109, volume: 1100 },
      { date: new Date("2024-01-04"), open: 109, high: 112, low: 107, close: 110, volume: 1300 },
      { date: new Date("2024-01-05"), open: 110, high: 115, low: 108, close: 113, volume: 1400 },
    ];
    const weekly = aggregateToWeekly(data);
    expect(weekly.length).toBeGreaterThanOrEqual(1);
    // Check that the week captures the full range
    expect(weekly[0].high).toBe(115);
    expect(weekly[0].low).toBe(98);
  });
});

describe("aggregateToMonthly", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateToMonthly([])).toEqual([]);
  });

  it("aggregates daily bars to monthly", () => {
    const data: OHLCV[] = [
      { date: new Date("2024-01-15"), open: 100, high: 120, low: 95, close: 110, volume: 10000 },
      { date: new Date("2024-01-16"), open: 110, high: 115, low: 108, close: 112, volume: 8000 },
      { date: new Date("2024-02-01"), open: 112, high: 125, low: 110, close: 122, volume: 12000 },
    ];
    const monthly = aggregateToMonthly(data);
    expect(monthly.length).toBe(2);
    // January
    expect(monthly[0].high).toBe(120);
    expect(monthly[0].low).toBe(95);
    // February
    expect(monthly[1].high).toBe(125);
    expect(monthly[1].low).toBe(110);
  });
});

describe("calculateATR", () => {
  it("returns null for insufficient data", () => {
    const data: OHLCV[] = [createBar(100, 90, 95)];
    expect(calculateATR(data, 14)).toBeNull();
  });

  it("calculates ATR for sufficient data", () => {
    // Create 20 bars with consistent range of 10
    const data: OHLCV[] = Array.from({ length: 20 }, (_, i) =>
      createBar(100, 90, 95, 1000, i)
    );
    const atr = calculateATR(data, 14);
    expect(atr).toBe(10); // All bars have h-l = 10, and no gaps
  });
});
