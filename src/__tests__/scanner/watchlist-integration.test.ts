import { describe, it, expect, vi, beforeEach } from "vitest";

const themeStocksRows = [
  { themeId: 1, ticker: "AAPL" },
  { themeId: 1, ticker: "MSFT" },
  { themeId: 2, ticker: "AAPL" },     // duplicate across themes
  { themeId: 2, ticker: "D05.SI" },
];

let priorMetricsRows: { ticker: string; dataQuality: string }[] = [];
let upsertedRows: any[] = [];
let universeUpserts: any[] = [];
let preservedUpdateCount = 0;
let deleteCalled = false;
let selectCount = 0;

vi.mock("@/db", () => {
  const themeStocks = { themeId: "themeId", ticker: "ticker" };
  const tickerMetrics = { ticker: "ticker", dataQuality: "dataQuality" };
  const scannerUniverse = { ticker: "ticker" };

  const tx = {
    delete: vi.fn(() => ({ where: vi.fn(async () => { deleteCalled = true; }) })),
    insert: vi.fn((table: any) => ({
      values: vi.fn((row: any) => ({
        onConflictDoUpdate: vi.fn(async () => {
          if (table === scannerUniverse) {
            universeUpserts.push(row);
          } else {
            upsertedRows.push(row);
          }
        }),
      })),
    })),
    // The orchestrator only calls update() in the preservation path (failed
    // fetch with a prior non-failed row). We just count invocations.
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          preservedUpdateCount++;
        }),
      })),
    })),
  };

  // Two selects per run: (1) themeStocks, (2) tickerMetrics for prior state.
  // The counter lives in module scope (above) so it can be reset per test.
  return {
    db: {
      select: vi.fn(() => {
        const idx = selectCount++;
        return {
          from: vi.fn(async () => {
            if (idx === 0) return themeStocksRows;
            if (idx === 1) return priorMetricsRows;
            return [];
          }),
        };
      }),
      transaction: vi.fn(async (cb: any) => cb(tx)),
    },
    themeStocks,
    tickerMetrics,
    scannerUniverse,
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
  price: 100, pc1d: 0.5, pc1w: 1.0, pc1m: 2.0, pc3m: 3.0, name: `Name of ${ticker}`, currency: "USD",
});

describe("computeWatchlistScores", () => {
  beforeEach(() => {
    upsertedRows = [];
    universeUpserts = [];
    preservedUpdateCount = 0;
    priorMetricsRows = [];
    deleteCalled = false;
    selectCount = 0;
    vi.mocked(buildScoringInputs).mockReset();
  });

  it("dedupes tickers across themes and writes one metrics row per ticker", async () => {
    vi.mocked(buildScoringInputs).mockImplementation(async (t) => okFetch(t));
    const result = await computeWatchlistScores();
    expect(result.tickersProcessed).toBe(3); // AAPL, MSFT, D05.SI
    const written = new Set(upsertedRows.map((r: any) => r.ticker));
    expect(written).toEqual(new Set(["AAPL", "MSFT", "D05.SI"]));
  });

  it("upserts scanner_universe for every observed ticker (registry sync)", async () => {
    vi.mocked(buildScoringInputs).mockImplementation(async (t) => okFetch(t));
    await computeWatchlistScores();
    const tickers = new Set(universeUpserts.map((r: any) => r.ticker));
    expect(tickers).toEqual(new Set(["AAPL", "MSFT", "D05.SI"]));
    const aapl = universeUpserts.find((r: any) => r.ticker === "AAPL");
    expect(aapl.name).toBe("Name of AAPL");
    expect(aapl.market).toBe("US");
    const dbs = universeUpserts.find((r: any) => r.ticker === "D05.SI");
    expect(dbs.market).toBe("SGX");
  });

  it("metrics row no longer carries name/market/themeIds/description", async () => {
    vi.mocked(buildScoringInputs).mockImplementation(async (t) => okFetch(t));
    await computeWatchlistScores();
    const aapl = upsertedRows.find((r: any) => r.ticker === "AAPL");
    expect(aapl.name).toBeUndefined();
    expect(aapl.market).toBeUndefined();
    expect(aapl.themeIds).toBeUndefined();
    expect(aapl.description).toBeUndefined();
  });

  it("writes data_quality='failed' for a brand-new ticker whose fetch returned null", async () => {
    // No prior row → nothing to preserve → the failed row gets inserted.
    vi.mocked(buildScoringInputs).mockImplementation(async (t) => t === "AAPL" ? null : okFetch(t));
    await computeWatchlistScores();
    const aapl = upsertedRows.find((r: any) => r.ticker === "AAPL");
    expect(aapl.dataQuality).toBe("failed");
    expect(aapl.momentumScore).toBeNull();
    expect(aapl.technicalScore).toBeNull();
  });

  it("preserves a previously-ok row when the current fetch fails", async () => {
    // AAPL was healthy last run; this run, its fetch fails. The orchestrator
    // should NOT overwrite the row with a failed state — it should leave the
    // metrics intact and only bump computedAt via tx.update().
    priorMetricsRows = [
      { ticker: "AAPL", dataQuality: "ok" },
      { ticker: "MSFT", dataQuality: "ok" },
      { ticker: "D05.SI", dataQuality: "partial" },
    ];
    vi.mocked(buildScoringInputs).mockImplementation(async (t) => t === "AAPL" ? null : okFetch(t));

    await computeWatchlistScores();

    // AAPL must NOT appear in upsertedRows — it should have been preserved.
    const upsertTickers = upsertedRows.map((r: any) => r.ticker);
    expect(upsertTickers).not.toContain("AAPL");
    // It WAS attempted (preservation path triggered an update for computedAt).
    expect(preservedUpdateCount).toBeGreaterThanOrEqual(1);
    // Healthy tickers still get full upserts.
    expect(upsertTickers).toContain("MSFT");
    expect(upsertTickers).toContain("D05.SI");
  });

  it("overwrites a previously-failed row with a fresh failed row (no preservation)", async () => {
    // AAPL was already 'failed' last run; preservation should NOT kick in
    // because there's nothing better to preserve.
    priorMetricsRows = [{ ticker: "AAPL", dataQuality: "failed" }];
    vi.mocked(buildScoringInputs).mockImplementation(async (t) => t === "AAPL" ? null : okFetch(t));

    await computeWatchlistScores();

    const aapl = upsertedRows.find((r: any) => r.ticker === "AAPL");
    expect(aapl).toBeDefined();
    expect(aapl.dataQuality).toBe("failed");
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
