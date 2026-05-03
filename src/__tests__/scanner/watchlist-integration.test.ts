import { describe, it, expect, vi, beforeEach } from "vitest";

const themeStocksRows = [
  { themeId: 1, ticker: "AAPL" },
  { themeId: 1, ticker: "MSFT" },
  { themeId: 2, ticker: "AAPL" },     // duplicate across themes
  { themeId: 2, ticker: "D05.SI" },
];

let upsertedRows: any[] = [];
let deleteCalled = false;

vi.mock("@/db", () => {
  const themeStocks = { themeId: "themeId", ticker: "ticker" };
  const watchlistScores = { ticker: "ticker" };
  const tx = {
    delete: vi.fn(() => ({ where: vi.fn(async () => { deleteCalled = true; }) })),
    insert: vi.fn(() => ({
      values: vi.fn((row: any) => ({
        onConflictDoUpdate: vi.fn(async () => { upsertedRows.push(row); }),
      })),
    })),
  };
  return {
    db: {
      select: vi.fn(() => ({ from: vi.fn(async () => themeStocksRows) })),
      transaction: vi.fn(async (cb: any) => cb(tx)),
    },
    themeStocks,
    watchlistScores,
  };
});

vi.mock("@/lib/scanner/watchlist-fetcher", () => ({
  buildScoringInputs: vi.fn(),
}));

import { computeWatchlistScores } from "@/lib/scanner/watchlist-orchestrator";
import { buildScoringInputs } from "@/lib/scanner/watchlist-fetcher";

const okFetch = (ticker: string) => ({
  inputs: {
    price: 100, return12mEx1m: 0.10, fiftyTwoWeekHigh: 110, fiftyTwoWeekLow: 80,
    closesAbove20SmaPct60d: 0.5, sma200: 90, sma50: 95, sma20: 98,
    rsi14: 55, macdLine: 1, macdSignal: 0.5, avgVol20d: 1_100_000, avgVol60d: 1_000_000, adx14: 22,
  },
  price: 100, pc1w: 1.0, pc1m: 2.0, pc3m: 3.0, name: `Name of ${ticker}`,
});

describe("computeWatchlistScores", () => {
  beforeEach(() => {
    upsertedRows = [];
    deleteCalled = false;
    vi.mocked(buildScoringInputs).mockReset();
  });

  it("dedupes tickers across themes and writes one row per ticker", async () => {
    vi.mocked(buildScoringInputs).mockImplementation(async (t) => okFetch(t));
    const result = await computeWatchlistScores();
    expect(result.tickersProcessed).toBe(3); // AAPL, MSFT, D05.SI
    const written = new Set(upsertedRows.map((r: any) => r.ticker));
    expect(written).toEqual(new Set(["AAPL", "MSFT", "D05.SI"]));
  });

  it("aggregates theme_ids for tickers spanning multiple themes", async () => {
    vi.mocked(buildScoringInputs).mockImplementation(async (t) => okFetch(t));
    await computeWatchlistScores();
    const aapl = upsertedRows.find((r: any) => r.ticker === "AAPL");
    expect(JSON.parse(aapl.themeIds).sort()).toEqual([1, 2]);
  });

  it("writes data_quality='failed' for a ticker whose fetch returned null", async () => {
    vi.mocked(buildScoringInputs).mockImplementation(async (t) => t === "AAPL" ? null : okFetch(t));
    await computeWatchlistScores();
    const aapl = upsertedRows.find((r: any) => r.ticker === "AAPL");
    expect(aapl.dataQuality).toBe("failed");
    expect(aapl.momentumScore).toBeNull();
    expect(aapl.technicalScore).toBeNull();
  });

  it("does NOT write to DB if every fetch returns null", async () => {
    vi.mocked(buildScoringInputs).mockResolvedValue(null);
    const result = await computeWatchlistScores();
    expect(result.allFailed).toBe(true);
    expect(upsertedRows.length).toBe(0);
    expect(deleteCalled).toBe(false);
  });

  it("returns ok=0, partial>=0 when no theme stocks tracked", async () => {
    // Override the themeStocks mock for this test
    const dbMod = await import("@/db");
    vi.mocked(dbMod.db.select as any).mockReturnValueOnce({ from: vi.fn(async () => []) });
    const result = await computeWatchlistScores();
    expect(result.tickersProcessed).toBe(0);
    expect(result.allFailed).toBe(false);
  });
});
