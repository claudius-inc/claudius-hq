# Watchlist Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the universe-wide scanner at `/markets/scanner/stocks` with a watchlist scoped to tickers tracked in themes, scored by new momentum + technical formulas. Refresh hourly via GitHub Actions and on-demand from the page. Rewire the paid ACP endpoint to the same data.

**Architecture:** A single shared library (`src/lib/scanner/watchlist.ts`) computes scores end-to-end and is invoked from two entry points: a CLI script run by GitHub Actions on cron, and a Next.js API route hit by the in-page Refresh button. Both write to a new `watchlist_scores` table that the page reads directly. The ACP endpoint reads the same table.

**Tech Stack:** Next.js 15 App Router (server components), Drizzle ORM + Turso (SQLite), `yahoo-finance2`, Vitest + jsdom, Tailwind, GitHub Actions.

**Spec:** `docs/specs/2026-05-03-watchlist-scanner-design.md`

**Scope:** This plan is PR1 — it adds the new system and disables the old cron, but leaves the old files on disk for rollback. A follow-up cleanup PR (not covered here) deletes the old scanner files listed in the spec's "What gets deleted" section, after 24h of stable operation.

---

## File Map

| Path | Action | Purpose |
|---|---|---|
| `drizzle/0007_add_watchlist_scores.sql` | Create | Migration: add `watchlist_scores` table + index. Does NOT drop `stock_scans` (deferred to cleanup PR). |
| `src/db/schema.ts` | Modify | Add `watchlistScores` Drizzle table + types. |
| `src/lib/scanner/enhanced-metrics.ts` | Modify | Add `priceChange1w` field + computation. |
| `src/lib/scanner/watchlist.ts` | Create | Pure scoring functions + orchestrator. |
| `src/__tests__/scanner/watchlist.test.ts` | Create | Unit tests for `scoreMomentum`, `scoreTechnical`. |
| `src/__tests__/scanner/watchlist-integration.test.ts` | Create | Integration test for `computeWatchlistScores` (mocked DB + Yahoo). |
| `scripts/run-watchlist-scanner.ts` | Create | CLI entry for the GH Action. |
| `.github/workflows/watchlist-scanner.yml` | Create | Hourly cron + manual dispatch. |
| `.github/workflows/scanner.yml` | Modify | Remove `schedule:` block (manual dispatch only) so old cron stops. |
| `src/app/api/markets/scanner/watchlist/refresh/route.ts` | Create | POST endpoint for on-demand refresh. |
| `src/__tests__/api/watchlist-refresh.test.ts` | Create | Route handler test. |
| `src/app/markets/scanner/stocks/page.tsx` | Rewrite | Server component reading from `watchlist_scores`. |
| `src/app/markets/scanner/stocks/_components/WatchlistTable.tsx` | Create | Client component: sortable table + filter chips + theme badges. |
| `src/app/markets/scanner/stocks/_components/WatchlistMethodologyModal.tsx` | Create | Modal explaining the new scoring formulas. |
| `src/app/markets/scanner/_components/RefreshButton.tsx` | Rewrite | Calls new endpoint synchronously, no GH polling. |
| `src/app/api/acp/stock-scan/route.ts` | Rewrite | Read `watchlist_scores`, return slim payload. |
| `src/__tests__/api/acp-stock-scan.test.ts` | Create | Route handler test. |

---

## Task 1: Schema migration + Drizzle definition

**Files:**
- Create: `drizzle/0007_add_watchlist_scores.sql`
- Modify: `src/db/schema.ts` (append after `stockScans` block at line 337)

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/0007_add_watchlist_scores.sql`:

```sql
-- Watchlist Scores: one row per ticker tracked in any theme.
-- Replaces the universe-wide stock_scans table for the /markets/scanner/stocks page.
-- stock_scans is intentionally NOT dropped here; it is removed in the cleanup PR
-- after the new system is verified stable.
CREATE TABLE IF NOT EXISTS watchlist_scores (
  ticker            TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  market            TEXT NOT NULL,            -- 'US' | 'SGX' | 'HK' | 'JP'
  price             REAL,
  momentum_score    REAL,                     -- 0-100, NULL if data_quality='failed'
  technical_score   REAL,                     -- 0-100, NULL if data_quality='failed'
  price_change_1w   REAL,
  price_change_1m   REAL,
  price_change_3m   REAL,
  theme_ids         TEXT NOT NULL,            -- JSON array of integer theme IDs
  data_quality      TEXT NOT NULL,            -- 'ok' | 'partial' | 'failed'
  computed_at       TEXT NOT NULL             -- ISO timestamp
);

CREATE INDEX IF NOT EXISTS idx_watchlist_scores_market ON watchlist_scores(market);
```

- [ ] **Step 2: Add the Drizzle table to schema.ts**

In `src/db/schema.ts`, append after the `stockScans` block (after line 337):

```ts
// ============================================================================
// Watchlist Scores
// ============================================================================

export const WATCHLIST_MARKETS = ["US", "SGX", "HK", "JP"] as const;
export type WatchlistMarket = (typeof WATCHLIST_MARKETS)[number];

export const WATCHLIST_DATA_QUALITY = ["ok", "partial", "failed"] as const;
export type WatchlistDataQuality = (typeof WATCHLIST_DATA_QUALITY)[number];

export const watchlistScores = sqliteTable("watchlist_scores", {
  ticker: text("ticker").primaryKey(),
  name: text("name").notNull(),
  market: text("market").$type<WatchlistMarket>().notNull(),
  price: real("price"),
  momentumScore: real("momentum_score"),
  technicalScore: real("technical_score"),
  priceChange1w: real("price_change_1w"),
  priceChange1m: real("price_change_1m"),
  priceChange3m: real("price_change_3m"),
  themeIds: text("theme_ids").notNull(), // JSON array
  dataQuality: text("data_quality").$type<WatchlistDataQuality>().notNull(),
  computedAt: text("computed_at").notNull(),
});

export type WatchlistScore = typeof watchlistScores.$inferSelect;
export type NewWatchlistScore = typeof watchlistScores.$inferInsert;
```

- [ ] **Step 3: Apply the migration locally to verify it parses**

Run: `npx drizzle-kit push --config=drizzle.config.ts`
Expected: prompts confirm the new table; accept. The output reports `watchlist_scores` created.

(If the local environment has no `.env.local` with Turso credentials, skip the push and just verify the SQL file is valid by `sqlite3 :memory: < drizzle/0007_add_watchlist_scores.sql` — should exit 0 with no output.)

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors. The new types should be exported correctly.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0007_add_watchlist_scores.sql src/db/schema.ts
git commit -m "feat(watchlist): add watchlist_scores table"
```

---

## Task 2: Add 1-week price change to enhanced-metrics

**Files:**
- Modify: `src/lib/scanner/enhanced-metrics.ts:111` (add `priceChange1w` field to `EnhancedStockMetrics`)
- Modify: same file's compute block around line 282 (compute `priceChange1w`)
- Modify: same file's return block around line 339 (round + emit)

- [ ] **Step 1: Read the current shape**

Run: `sed -n '108,120p;280,295p;337,345p' src/lib/scanner/enhanced-metrics.ts`
Expected: see the `Price momentum` section, the `priceChange1m`/`priceChange3m` calculations from `price1m`/`price3m`, and the return block rounding them.

- [ ] **Step 2: Add `priceChange1w: number | null` to the interface**

In `src/lib/scanner/enhanced-metrics.ts`, in the `EnhancedStockMetrics` interface, add immediately above `priceChange1m: number | null;` (line 111):

```ts
  priceChange1w: number | null;
```

- [ ] **Step 3: Compute `priceChange1w` from historical bars**

In the compute block (near line 280–285), add after the `price3m` lookup pattern:

```ts
const price1w = findPriceDaysAgo(historical, 5); // 5 trading days back
const priceChange1w = price1w ? ((priceNow - price1w) / price1w) * 100 : null;
```

If `findPriceDaysAgo` does not yet exist in the file, search for the helper used by `price1m`/`price3m` (likely an inline expression or named differently — adapt). If the file uses inline date math, add an inline equivalent: find the close from 5 trading days before the latest bar.

- [ ] **Step 4: Emit `priceChange1w` in the return object**

In the return block (around line 339), add immediately above the `priceChange1m:` line:

```ts
  priceChange1w: priceChange1w !== null ? Math.round(priceChange1w * 100) / 100 : null,
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors. Any other consumer of `EnhancedStockMetrics` is unaffected because the new field is additive.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scanner/enhanced-metrics.ts
git commit -m "feat(scanner): add 1-week price change to enhanced metrics"
```

---

## Task 3: Pure scoring functions with unit tests

**Files:**
- Create: `src/lib/scanner/watchlist.ts`
- Create: `src/__tests__/scanner/watchlist.test.ts`

- [ ] **Step 1: Write failing tests for `scoreMomentum`**

Create `src/__tests__/scanner/watchlist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreMomentum, scoreTechnical, type ScoringInputs } from "@/lib/scanner/watchlist";

const baseInputs: ScoringInputs = {
  price: 100,
  return12mEx1m: 0,
  fiftyTwoWeekHigh: 100,
  fiftyTwoWeekLow: 50,
  closesAbove20SmaPct60d: 0.5,
  sma200: 90,
  sma50: 95,
  sma20: 98,
  rsi14: 50,
  macdLine: 1,
  macdSignal: 0.5,
  avgVol20d: 1_000_000,
  avgVol60d: 1_000_000,
  adx14: 20,
};

describe("scoreMomentum", () => {
  it("scores 100 when every factor is at its top tier", () => {
    const s = scoreMomentum({
      ...baseInputs,
      return12mEx1m: 0.40,           // ≥30% → 40
      price: 100,
      fiftyTwoWeekHigh: 100,
      fiftyTwoWeekLow: 50,           // position = 1.0 → 25
      closesAbove20SmaPct60d: 1.0,   // → 20
      sma200: 50,                    // (100-50)/50 = 1.0, capped at 0.5 → 15
    });
    expect(s).toBe(100);
  });

  it("scores 0 when 12-1M return is the worst tier and price is at the 52w low", () => {
    const s = scoreMomentum({
      ...baseInputs,
      return12mEx1m: -0.20,          // < -10% → 0
      price: 50,
      fiftyTwoWeekHigh: 100,
      fiftyTwoWeekLow: 50,           // position = 0 → 0
      closesAbove20SmaPct60d: 0,     // → 0
      sma200: 100,                   // (50-100)/100 = -0.5 → 0
    });
    expect(s).toBe(0);
  });

  it("contributes 0 for missing factors and marks score < 100 (no renorm)", () => {
    const s = scoreMomentum({
      ...baseInputs,
      return12mEx1m: null,
      price: 100,
      fiftyTwoWeekHigh: 100,
      fiftyTwoWeekLow: 50,           // 25 from 52w-position
      closesAbove20SmaPct60d: null,
      sma200: null,
    });
    expect(s).toBe(25);
  });

  it("uses tiered mapping for 12-1M return", () => {
    expect(
      scoreMomentum({ ...baseInputs, return12mEx1m: 0.16 })
    ).toBeGreaterThanOrEqual(28);
    expect(
      scoreMomentum({ ...baseInputs, return12mEx1m: 0.05 })
    ).toBeGreaterThanOrEqual(16);
  });
});

describe("scoreTechnical", () => {
  it("scores 100 when every factor is at its top tier", () => {
    const s = scoreTechnical({
      ...baseInputs,
      price: 100,
      sma20: 98,
      sma50: 95,
      sma200: 90,                    // full stack → 30
      rsi14: 60,                     // 50–70 → 25
      macdLine: 1,
      macdSignal: 0.5,               // > signal & > 0 → 20
      avgVol20d: 1_400_000,
      avgVol60d: 1_000_000,          // +40% → 15
      adx14: 45,                     // ≥40 → 10
    });
    expect(s).toBe(100);
  });

  it("penalizes overbought RSI", () => {
    const high = scoreTechnical({ ...baseInputs, rsi14: 60 });
    const overbought = scoreTechnical({ ...baseInputs, rsi14: 85 });
    expect(overbought).toBeLessThan(high);
  });

  it("MA stack: 0 points when fully inverted", () => {
    const s = scoreTechnical({
      ...baseInputs,
      price: 80,
      sma20: 90,
      sma50: 95,
      sma200: 100,
    });
    // MA stack contributes 0; other factors at neutral baseInputs values
    // (RSI 50 → 25, MACD 1>0.5>0 → 20, vol equal → 6, ADX 20 → 3)
    expect(s).toBe(0 + 25 + 20 + 6 + 3);
  });

  it("contributes 0 for missing factors", () => {
    const s = scoreTechnical({
      ...baseInputs,
      sma20: null,
      sma50: null,
      sma200: null,
      rsi14: null,
      macdLine: null,
      macdSignal: null,
      avgVol20d: null,
      avgVol60d: null,
      adx14: null,
    });
    expect(s).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/scanner/watchlist.test.ts`
Expected: FAIL — module `@/lib/scanner/watchlist` not found.

- [ ] **Step 3: Create the scoring module with minimal types**

Create `src/lib/scanner/watchlist.ts`:

```ts
/**
 * Watchlist scoring + orchestration.
 *
 * Two pure scoring functions (scoreMomentum, scoreTechnical) and one
 * orchestrator (computeWatchlistScores) that fetches data and writes to DB.
 *
 * The pure functions are unit-tested with hand-built inputs.
 * The orchestrator is integration-tested against a mocked DB + Yahoo client.
 */

export interface ScoringInputs {
  price: number | null;

  // Momentum inputs
  return12mEx1m: number | null;          // decimal, e.g. 0.15 = +15%
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  closesAbove20SmaPct60d: number | null; // 0..1
  sma200: number | null;

  // Technical inputs
  sma50: number | null;
  sma20: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  avgVol20d: number | null;
  avgVol60d: number | null;
  adx14: number | null;
}

// ---------- Momentum ----------

function score12mEx1m(r: number | null): number {
  if (r === null) return 0;
  if (r >= 0.30) return 40;
  if (r >= 0.15) return 28;
  if (r >= 0)    return 16;
  if (r >= -0.10) return 8;
  return 0;
}

function score52wPosition(price: number | null, hi: number | null, lo: number | null): number {
  if (price === null || hi === null || lo === null || hi <= lo) return 0;
  const pos = Math.min(1, Math.max(0, (price - lo) / (hi - lo)));
  return Math.round(pos * 25);
}

function scoreTrendPersistence(pct: number | null): number {
  if (pct === null) return 0;
  return Math.round(Math.min(1, Math.max(0, pct)) * 20);
}

function scoreDistAbove200(price: number | null, sma200: number | null): number {
  if (price === null || sma200 === null || sma200 === 0) return 0;
  const dist = (price - sma200) / sma200;
  if (dist <= 0) return 0;
  const capped = Math.min(0.50, dist);
  return Math.round((capped / 0.50) * 15);
}

export function scoreMomentum(i: ScoringInputs): number {
  return (
    score12mEx1m(i.return12mEx1m) +
    score52wPosition(i.price, i.fiftyTwoWeekHigh, i.fiftyTwoWeekLow) +
    scoreTrendPersistence(i.closesAbove20SmaPct60d) +
    scoreDistAbove200(i.price, i.sma200)
  );
}

// ---------- Technical ----------

function scoreMaStack(p: number | null, s20: number | null, s50: number | null, s200: number | null): number {
  if (p === null || s20 === null || s50 === null || s200 === null) return 0;
  const pairs = [p > s20, s20 > s50, s50 > s200];
  const correct = pairs.filter(Boolean).length;
  if (correct === 3) return 30;
  if (correct === 2) return 20;
  if (correct === 1) return 10;
  return 0;
}

function scoreRsi(rsi: number | null): number {
  if (rsi === null) return 0;
  if (rsi >= 50 && rsi <= 70) return 25;
  if ((rsi >= 40 && rsi < 50) || (rsi > 70 && rsi <= 75)) return 18;
  if ((rsi >= 30 && rsi < 40) || (rsi > 75 && rsi <= 80)) return 10;
  return 0;
}

function scoreMacd(line: number | null, signal: number | null): number {
  if (line === null || signal === null) return 0;
  if (line > signal && line > 0) return 20;
  if (line > signal) return 12;
  if (line > 0) return 6;
  return 0;
}

function scoreVolumeTrend(v20: number | null, v60: number | null): number {
  if (v20 === null || v60 === null || v60 === 0) return 0;
  const change = v20 / v60 - 1;
  if (change >= 0.30) return 15;
  if (change >= 0.10) return 10;
  if (change >= 0)    return 6;
  return 0;
}

function scoreAdx(adx: number | null): number {
  if (adx === null) return 0;
  if (adx >= 40) return 10;
  if (adx >= 25) return 7;
  if (adx >= 15) return 3;
  return 0;
}

export function scoreTechnical(i: ScoringInputs): number {
  return (
    scoreMaStack(i.price, i.sma20, i.sma50, i.sma200) +
    scoreRsi(i.rsi14) +
    scoreMacd(i.macdLine, i.macdSignal) +
    scoreVolumeTrend(i.avgVol20d, i.avgVol60d) +
    scoreAdx(i.adx14)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/scanner/watchlist.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scanner/watchlist.ts src/__tests__/scanner/watchlist.test.ts
git commit -m "feat(watchlist): add momentum + technical scoring functions"
```

---

## Task 4: `computeWatchlistScores` orchestrator + integration test

**Files:**
- Modify: `src/lib/scanner/watchlist.ts` (append the orchestrator)
- Create: `src/__tests__/scanner/watchlist-integration.test.ts`

The orchestrator must:
1. Read the deduped set of tickers from `theme_stocks`, joined with `themes` for theme IDs.
2. For each ticker, fetch Yahoo data via `fetchEnhancedMetrics()` and the existing `yahoo-fetcher.ts` helpers needed for the technical inputs (SMA/RSI/MACD/ADX).
3. Compute scores; classify `data_quality`.
4. If *every* fetch failed, exit early without writing (don't poison the table).
5. Otherwise, in a single transaction: delete tickers no longer in the set, then upsert all current rows.

- [ ] **Step 1: Survey what Yahoo helpers already exist**

Run: `grep -n "^export" src/lib/scanner/yahoo-fetcher.ts | head -20`
Expected: see exports for batch metric fetchers. Note function names that return SMA/RSI/MACD/ADX/volume averages — the orchestrator will reuse them. If a needed indicator (e.g., ADX) is not exposed, add a helper inside `watchlist.ts` that computes it from the raw OHLCV bars `yahoo-fetcher.ts` already returns.

Document the mapping you find (write inline comments in the orchestrator for the next reader).

- [ ] **Step 2: Write the failing integration test**

Create `src/__tests__/scanner/watchlist-integration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const themeStocksRows = [
  { themeId: 1, ticker: "AAPL" },
  { themeId: 1, ticker: "MSFT" },
  { themeId: 2, ticker: "AAPL" }, // duplicate across themes
  { themeId: 2, ticker: "D05.SI" },
];

const upserts: any[] = [];
const deletes: string[] = [];

vi.mock("@/db", () => {
  const themeStocks = { themeId: "theme_id", ticker: "ticker" };
  const watchlistScores = { ticker: "ticker" };
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue(themeStocksRows),
      }),
      transaction: vi.fn(async (cb: any) => cb({
        delete: vi.fn().mockReturnValue({
          where: vi.fn(async (whereExpr: any) => { deletes.push(whereExpr); }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn(async (cfg: any) => { upserts.push(cfg); }),
          }),
        }),
      })),
    },
    themeStocks,
    watchlistScores,
  };
});

// Mock Yahoo
vi.mock("@/lib/scanner/enhanced-metrics", () => ({
  fetchEnhancedMetrics: vi.fn(async (ticker: string) => {
    if (ticker === "FAIL.SI") return null;
    return {
      ticker,
      currentPrice: 100,
      priceChange1w: 1.0,
      priceChange1m: 2.0,
      priceChange3m: 3.0,
      fiftyTwoWeekHigh: 110,
      fiftyTwoWeekLow: 80,
      // ... other fields the orchestrator reads (fill per the actual interface)
    };
  }),
}));

import { computeWatchlistScores } from "@/lib/scanner/watchlist";

describe("computeWatchlistScores", () => {
  beforeEach(() => {
    upserts.length = 0;
    deletes.length = 0;
  });

  it("dedupes tickers across themes and writes one row per ticker", async () => {
    const result = await computeWatchlistScores();
    // 3 distinct tickers: AAPL, MSFT, D05.SI
    expect(result.tickersProcessed).toBe(3);
    // Upsert called once with batched values OR three times — assert on the
    // unique tickers actually written (read from `upserts`).
    const writtenTickers = new Set(
      upserts.flatMap((u) => (Array.isArray(u.values) ? u.values : [u.values])).map((v: any) => v.ticker)
    );
    expect(writtenTickers).toEqual(new Set(["AAPL", "MSFT", "D05.SI"]));
  });

  it("aggregates theme_ids for tickers that span multiple themes", async () => {
    await computeWatchlistScores();
    const written = upserts.flatMap((u) => (Array.isArray(u.values) ? u.values : [u.values]));
    const aapl = written.find((v: any) => v.ticker === "AAPL");
    const themeIds = JSON.parse(aapl.themeIds);
    expect(themeIds.sort()).toEqual([1, 2]);
  });

  it("writes data_quality='failed' when Yahoo returns null for a ticker", async () => {
    // Override mock for this test
    const enhanced = await import("@/lib/scanner/enhanced-metrics");
    vi.mocked(enhanced.fetchEnhancedMetrics).mockImplementationOnce(async () => null);
    await computeWatchlistScores();
    const written = upserts.flatMap((u) => (Array.isArray(u.values) ? u.values : [u.values]));
    const failed = written.find((v: any) => v.dataQuality === "failed");
    expect(failed).toBeTruthy();
    expect(failed.momentumScore).toBeNull();
    expect(failed.technicalScore).toBeNull();
  });

  it("does NOT write to DB if every fetch fails", async () => {
    const enhanced = await import("@/lib/scanner/enhanced-metrics");
    vi.mocked(enhanced.fetchEnhancedMetrics).mockResolvedValue(null);
    const result = await computeWatchlistScores();
    expect(result.allFailed).toBe(true);
    expect(upserts.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/scanner/watchlist-integration.test.ts`
Expected: FAIL — `computeWatchlistScores` not exported.

- [ ] **Step 4: Implement the orchestrator**

Append to `src/lib/scanner/watchlist.ts`:

```ts
import { db, themeStocks, watchlistScores } from "@/db";
import { fetchEnhancedMetrics } from "@/lib/scanner/enhanced-metrics";
import { sql } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { normalizeTickerForYahoo } from "@/lib/yahoo-utils";
import type { WatchlistDataQuality, WatchlistMarket, NewWatchlistScore } from "@/db/schema";

export interface ComputeResult {
  tickersProcessed: number;
  okCount: number;
  partialCount: number;
  failedCount: number;
  allFailed: boolean;
}

function detectMarket(ticker: string): WatchlistMarket {
  const t = ticker.toUpperCase();
  if (t.endsWith(".SI")) return "SGX";
  if (t.endsWith(".HK")) return "HK";
  if (t.endsWith(".T"))  return "JP";
  return "US";
}

function classifyQuality(scoring: ScoringInputs, fetched: boolean): WatchlistDataQuality {
  if (!fetched) return "failed";
  // partial: at least one momentum or technical input is null
  const requiredForOk = [
    scoring.return12mEx1m, scoring.fiftyTwoWeekHigh, scoring.fiftyTwoWeekLow,
    scoring.closesAbove20SmaPct60d, scoring.sma200, scoring.sma50, scoring.sma20,
    scoring.rsi14, scoring.macdLine, scoring.macdSignal, scoring.avgVol20d,
    scoring.avgVol60d, scoring.adx14, scoring.price,
  ];
  return requiredForOk.some((v) => v === null) ? "partial" : "ok";
}

/**
 * Build ScoringInputs from the data Yahoo gave us.
 * NOTE: fetchEnhancedMetrics returns priceChangeXm + 52w hi/lo. Other indicators
 * (SMA20/50/200, RSI, MACD, ADX, volume averages, return12mEx1m, closes-above-20-sma %)
 * must be derived from the daily historical bars yahoo-fetcher.ts already retrieves
 * (1y of bars). Add helper computations to this file as needed (kept private).
 */
async function buildScoringInputs(ticker: string): Promise<{
  inputs: ScoringInputs;
  metrics: Awaited<ReturnType<typeof fetchEnhancedMetrics>>;
} | null> {
  // TODO during implementation: choose the right Yahoo entry point. fetchEnhancedMetrics
  // is the heaviest call (also pulls institutional data we don't need). If unnecessary,
  // call yahoo-fetcher.ts helpers directly to fetch only the daily history + quote
  // (cheaper, faster). Keep the API of buildScoringInputs stable so the orchestrator
  // doesn't change.
  const yahooTicker = normalizeTickerForYahoo(ticker);
  const metrics = await fetchEnhancedMetrics(yahooTicker, 0, 0); // price + mcap zero since we don't pre-know them; helper handles
  if (!metrics) return null;
  // Map metrics + computed indicators into ScoringInputs:
  return {
    metrics,
    inputs: {
      price: metrics.currentPrice ?? null,
      return12mEx1m: null,            // FILL: derive from historical bars
      fiftyTwoWeekHigh: metrics.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: metrics.fiftyTwoWeekLow,
      closesAbove20SmaPct60d: null,   // FILL
      sma200: null,                    // FILL
      sma50: null,                     // FILL
      sma20: null,                     // FILL
      rsi14: null,                     // FILL
      macdLine: null,                  // FILL
      macdSignal: null,                // FILL
      avgVol20d: null,                 // FILL
      avgVol60d: null,                 // FILL
      adx14: null,                     // FILL
    },
  };
}

export async function computeWatchlistScores(): Promise<ComputeResult> {
  const startedAt = new Date().toISOString();

  // 1. Read deduped tickers + theme membership
  const rows = await db.select({ themeId: themeStocks.themeId, ticker: themeStocks.ticker })
    .from(themeStocks);

  const themesByTicker = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.ticker) continue;
    const arr = themesByTicker.get(r.ticker) ?? [];
    arr.push(r.themeId);
    themesByTicker.set(r.ticker, arr);
  }

  const tickers = [...themesByTicker.keys()];

  if (tickers.length === 0) {
    logger.info("watchlist", "No theme stocks tracked; skipping run");
    return { tickersProcessed: 0, okCount: 0, partialCount: 0, failedCount: 0, allFailed: false };
  }

  // 2. Fetch + score each ticker
  const newRows: NewWatchlistScore[] = [];
  let okCount = 0, partialCount = 0, failedCount = 0;

  for (const ticker of tickers) {
    const themeIds = themesByTicker.get(ticker) ?? [];
    let inputs: ScoringInputs | null = null;
    let metrics: Awaited<ReturnType<typeof fetchEnhancedMetrics>> = null;
    let name = ticker;
    let market: WatchlistMarket = detectMarket(ticker);
    let price: number | null = null;
    let pc1w: number | null = null, pc1m: number | null = null, pc3m: number | null = null;

    try {
      const built = await buildScoringInputs(ticker);
      if (built) {
        inputs = built.inputs;
        metrics = built.metrics;
        name = (metrics as any)?.shortName ?? (metrics as any)?.longName ?? ticker;
        price = metrics?.currentPrice ?? null;
        pc1w = metrics?.priceChange1w ?? null;
        pc1m = metrics?.priceChange1m ?? null;
        pc3m = metrics?.priceChange3m ?? null;
      }
    } catch (err) {
      logger.warn("watchlist", `Fetch failed for ${ticker}`, { error: err });
    }

    const quality = classifyQuality(inputs ?? {} as ScoringInputs, inputs !== null);
    const momentum = inputs ? scoreMomentum(inputs) : null;
    const technical = inputs ? scoreTechnical(inputs) : null;

    if (quality === "ok") okCount++;
    else if (quality === "partial") partialCount++;
    else failedCount++;

    newRows.push({
      ticker,
      name,
      market,
      price,
      momentumScore: momentum,
      technicalScore: technical,
      priceChange1w: pc1w,
      priceChange1m: pc1m,
      priceChange3m: pc3m,
      themeIds: JSON.stringify(themeIds.sort((a, b) => a - b)),
      dataQuality: quality,
      computedAt: startedAt,
    });
  }

  // 3. Bail if EVERY ticker failed (don't poison the table)
  if (failedCount === tickers.length) {
    logger.error("watchlist", "Every ticker fetch failed; skipping DB write");
    return {
      tickersProcessed: tickers.length,
      okCount: 0, partialCount: 0, failedCount,
      allFailed: true,
    };
  }

  // 4. Replace the canonical set in one transaction
  await db.transaction(async (tx) => {
    // Delete tickers no longer present
    await tx.delete(watchlistScores).where(
      sql`ticker NOT IN (${sql.join(tickers.map((t) => sql`${t}`), sql`, `)})`
    );
    // Upsert each (libSQL: do this row-by-row or in batches; Drizzle supports onConflictDoUpdate)
    for (const row of newRows) {
      await tx.insert(watchlistScores).values(row).onConflictDoUpdate({
        target: watchlistScores.ticker,
        set: {
          name: row.name,
          market: row.market,
          price: row.price,
          momentumScore: row.momentumScore,
          technicalScore: row.technicalScore,
          priceChange1w: row.priceChange1w,
          priceChange1m: row.priceChange1m,
          priceChange3m: row.priceChange3m,
          themeIds: row.themeIds,
          dataQuality: row.dataQuality,
          computedAt: row.computedAt,
        },
      });
    }
  });

  logger.info("watchlist", `Run complete: ${okCount} ok / ${partialCount} partial / ${failedCount} failed`);

  return {
    tickersProcessed: tickers.length,
    okCount, partialCount, failedCount,
    allFailed: false,
  };
}
```

The `// FILL` comments in `buildScoringInputs` are intentional — finalize the indicator-derivation code while looking at the actual Yahoo-fetcher exports surveyed in Step 1. Keep helpers (computeSMA, computeRSI14, computeMACD, computeADX14, returns, persistence) private to this file. Each helper is small enough to fit in 10–20 lines and operate on the array of daily closes/highs/lows/volumes that yahoo-fetcher already returns.

- [ ] **Step 5: Implement the indicator helpers (SMA, RSI, MACD, ADX, persistence, return12mEx1m)**

Add these private helpers near the top of `watchlist.ts` (above `buildScoringInputs`). Use textbook formulas:

- `sma(values: number[], n: number)` — last-n simple mean.
- `rsi14(closes: number[])` — Wilder's smoothing, 14 periods.
- `macd(closes: number[])` — 12/26 EMA pair + 9 EMA signal.
- `adx14(highs, lows, closes)` — Wilder's ADX.
- `closesAbovePctOver(closes, lookbackDays, smaWindow)` — fraction of last `lookbackDays` where close > rolling SMA.
- `return12mEx1m(closes, dates)` — `closes[t-21] / closes[t-252] - 1` (252 trading days back close, 21 days back close as the "ex-1m" anchor).

Each helper returns `null` if the input array is too short.

Then wire `buildScoringInputs` to use them, replacing every `// FILL` line.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/__tests__/scanner/`
Expected: all tests PASS (the unit tests from Task 3 are unaffected; the new integration tests pass).

If the integration tests still fail because of mismatches between mock data shape and what `buildScoringInputs` reads, simplify the mock by stubbing `buildScoringInputs` directly via `vi.mock` rather than mocking `fetchEnhancedMetrics`. Keep the *behavior* assertions identical (dedup, theme aggregation, all-fail bail-out, failed-row marking).

- [ ] **Step 7: Commit**

```bash
git add src/lib/scanner/watchlist.ts src/__tests__/scanner/watchlist-integration.test.ts
git commit -m "feat(watchlist): add computeWatchlistScores orchestrator"
```

---

## Task 5: CLI script for the GitHub Action

**Files:**
- Create: `scripts/run-watchlist-scanner.ts`

- [ ] **Step 1: Write the script**

```ts
#!/usr/bin/env tsx
/**
 * Entry point for the watchlist scanner GitHub Action.
 * Calls computeWatchlistScores() and exits with the appropriate code.
 *
 * Env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
 */
import { computeWatchlistScores } from "@/lib/scanner/watchlist";

async function main() {
  const startedAt = Date.now();
  const result = await computeWatchlistScores();
  const elapsedMs = Date.now() - startedAt;

  console.log(JSON.stringify({
    event: "watchlist_run_complete",
    elapsed_ms: elapsedMs,
    ...result,
  }));

  if (result.allFailed) {
    console.error("All ticker fetches failed; exiting 1.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Watchlist scanner crashed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it parses and resolves imports**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (Path alias `@/` already configured; if `scripts/` is not in `tsconfig` `include`, add it as needed — check existing scripts that already work.)

If your `tsconfig.json` excludes `scripts/`, you may also verify with:
Run: `npx tsx --no-cache --check scripts/run-watchlist-scanner.ts` (or simply attempting a dry-run with a stub Turso URL that's expected to fail at connect).

- [ ] **Step 3: Commit**

```bash
git add scripts/run-watchlist-scanner.ts
git commit -m "feat(watchlist): add CLI entry for GH Action"
```

---

## Task 6: GitHub Action workflow + disable old cron

**Files:**
- Create: `.github/workflows/watchlist-scanner.yml`
- Modify: `.github/workflows/scanner.yml` (remove the `schedule:` block; keep `workflow_dispatch:` for manual rescue runs)

- [ ] **Step 1: Create the new workflow**

```yaml
name: Watchlist Scanner

on:
  schedule:
    # Hourly at :05 on weekdays (UTC). Markets that are closed produce no-op refreshes.
    - cron: '5 * * * 1-5'
  workflow_dispatch: {}

jobs:
  scan:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run watchlist scanner
        run: npx tsx scripts/run-watchlist-scanner.ts
        env:
          TURSO_DATABASE_URL: ${{ secrets.TURSO_DATABASE_URL }}
          TURSO_AUTH_TOKEN: ${{ secrets.TURSO_AUTH_TOKEN }}

      - name: Revalidate page cache
        if: success()
        run: |
          curl -X POST "https://hq.claudiusinc.com/api/scanner/revalidate" \
            -H "Authorization: Bearer ${{ secrets.HQ_API_KEY }}" \
            -H "Content-Type: application/json" \
            --fail --silent --show-error || echo "Revalidation failed (non-critical)"

      - name: Summary
        if: always()
        run: |
          echo "## Watchlist Scanner" >> $GITHUB_STEP_SUMMARY
          echo "- Run time: $(date -u)" >> $GITHUB_STEP_SUMMARY
```

- [ ] **Step 2: Disable the old cron**

Edit `.github/workflows/scanner.yml`. Replace the `on:` block with:

```yaml
on:
  workflow_dispatch:
    inputs:
      markets:
        description: 'Markets to scan (comma-separated: US,SGX,HK,JP,CN)'
        required: false
        default: 'US,SGX,HK,JP,CN'
```

This removes the `schedule:` trigger entirely. The workflow remains runnable manually until the cleanup PR deletes the file.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/watchlist-scanner.yml .github/workflows/scanner.yml
git commit -m "ci: add watchlist scanner workflow, disable old scanner cron"
```

---

## Task 7: API route for on-demand refresh

**Files:**
- Create: `src/app/api/markets/scanner/watchlist/refresh/route.ts`
- Create: `src/__tests__/api/watchlist-refresh.test.ts`

The route is POST-only, requires `Authorization: Bearer <HQ_API_KEY>` (matching the existing `/api/scanner/revalidate` pattern), and runs `computeWatchlistScores()` synchronously.

- [ ] **Step 1: Survey the existing auth pattern**

Run: `grep -n "HQ_API_KEY\|Authorization" src/app/api/scanner/revalidate/route.ts`
Expected: the existing handler reads `req.headers.get("authorization")` and compares against `process.env.HQ_API_KEY`. Mirror that exact pattern.

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/api/watchlist-refresh.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/scanner/watchlist", () => ({
  computeWatchlistScores: vi.fn(async () => ({
    tickersProcessed: 5,
    okCount: 4, partialCount: 1, failedCount: 0,
    allFailed: false,
  })),
}));

import { POST } from "@/app/api/markets/scanner/watchlist/refresh/route";

const ORIG_KEY = process.env.HQ_API_KEY;

beforeEach(() => {
  process.env.HQ_API_KEY = "test-secret";
});

afterAll(() => {
  process.env.HQ_API_KEY = ORIG_KEY;
});

function makeReq(headers: Record<string, string> = {}): any {
  return new Request("http://localhost/api/markets/scanner/watchlist/refresh", {
    method: "POST",
    headers,
  });
}

describe("POST /api/markets/scanner/watchlist/refresh", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("rejects wrong bearer", async () => {
    const res = await POST(makeReq({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("runs the scanner and returns the summary on success", async () => {
    const res = await POST(makeReq({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      tickersProcessed: 5,
      okCount: 4,
      failedCount: 0,
    });
  });

  it("returns 503 when allFailed is true", async () => {
    const mod = await import("@/lib/scanner/watchlist");
    vi.mocked(mod.computeWatchlistScores).mockResolvedValueOnce({
      tickersProcessed: 5, okCount: 0, partialCount: 0, failedCount: 5, allFailed: true,
    });
    const res = await POST(makeReq({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/__tests__/api/watchlist-refresh.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the route**

Create `src/app/api/markets/scanner/watchlist/refresh/route.ts`:

```ts
import { NextResponse } from "next/server";
import { computeWatchlistScores } from "@/lib/scanner/watchlist";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const expected = process.env.HQ_API_KEY;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { success: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await computeWatchlistScores();
    if (result.allFailed) {
      return NextResponse.json(
        { success: false, error: "all_failed", ...result },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error("watchlist-refresh", "Run crashed", { error: err });
    return NextResponse.json(
      { success: false, error: "internal_error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/api/watchlist-refresh.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/markets/scanner/watchlist/refresh/route.ts src/__tests__/api/watchlist-refresh.test.ts
git commit -m "feat(watchlist): add on-demand refresh API route"
```

---

## Task 8: Rewrite the RefreshButton

**Files:**
- Modify (full rewrite): `src/app/markets/scanner/_components/RefreshButton.tsx`

The new button calls the synchronous endpoint. No GH polling, no `lastRun` state. The button is the only caller of the file (`grep -rn "RefreshButton" src/` confirms), so a full rewrite is safe.

- [ ] **Step 1: Write the new component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export function RefreshButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const onClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/markets/scanner/watchlist/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // The button is server-side rendered to read the key from a runtime config
          // injected via a server action or a thin proxy route. Simplest: use a
          // dedicated proxy at /api/markets/scanner/watchlist/refresh-proxy that
          // attaches the key server-side. For this PR, the page wires that proxy.
        },
      });
      const data = await res.json();
      if (data.success) {
        toast(`Refreshed ${data.tickersProcessed} tickers`, "success");
        router.refresh();
      } else if (res.status === 503) {
        toast("Yahoo data unavailable; showing previous values", "error");
      } else {
        toast(data.error || "Refresh failed", "error");
      }
    } catch (err) {
      toast("Refresh failed", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[36px]"
      title={loading ? "Refreshing..." : "Refresh watchlist"}
    >
      {loading ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span className="hidden sm:inline">Refreshing</span>
        </>
      ) : (
        <>
          <RefreshCw size={14} />
          <span className="hidden sm:inline">Refresh</span>
        </>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Add a thin server proxy route to attach the API key**

Because the bearer key cannot be exposed to the browser, add a proxy route that the button hits instead. Replace the button's `fetch` URL with `/api/markets/scanner/watchlist/refresh-proxy` (no auth header from client; server attaches it).

Create `src/app/api/markets/scanner/watchlist/refresh-proxy/route.ts`:

```ts
import { NextResponse } from "next/server";
import { computeWatchlistScores } from "@/lib/scanner/watchlist";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth"; // existing app-session auth helper

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Browser-callable proxy. Requires an authenticated app session
 * (same gating as other admin actions in this app). No bearer key
 * required from the client; this runs server-side and could call the
 * external endpoint with a key, but since computeWatchlistScores() is
 * already in-process, we just call it directly.
 */
export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await computeWatchlistScores();
    if (result.allFailed) {
      return NextResponse.json({ success: false, error: "all_failed", ...result }, { status: 503 });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error("watchlist-refresh-proxy", "Run crashed", { error: err });
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
```

If the project's auth helper has a different name/path, update the import and the gate accordingly. Confirm by:

Run: `grep -rn "export.*async function auth\|export const auth" src/lib/ src/app/ | head`

- [ ] **Step 3: Update the button to call the proxy**

In `src/app/markets/scanner/_components/RefreshButton.tsx`, change the fetch URL:

```ts
const res = await fetch("/api/markets/scanner/watchlist/refresh-proxy", {
  method: "POST",
});
```

Remove the `headers` block — none needed.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/markets/scanner/_components/RefreshButton.tsx \
        src/app/api/markets/scanner/watchlist/refresh-proxy/route.ts
git commit -m "feat(watchlist): rewire RefreshButton to synchronous endpoint"
```

---

## Task 9: WatchlistMethodologyModal

**Files:**
- Create: `src/app/markets/scanner/stocks/_components/WatchlistMethodologyModal.tsx`

- [ ] **Step 1: Survey the existing MethodologyModal for the modal shell pattern**

Run: `cat src/app/markets/scanner/_components/MethodologyModal.tsx`
Expected: a client component using a `<Dialog>` or similar primitive. Reuse the same shell wrapper so styling matches.

- [ ] **Step 2: Write the new modal**

```tsx
"use client";

import { useState } from "react";
import { Info } from "lucide-react";
// Reuse whichever Dialog primitive MethodologyModal uses (e.g. from @/components/ui/Dialog)
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";

export function WatchlistMethodologyModal() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <Info size={12} />
          Methodology
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <h2 className="text-lg font-semibold mb-3">Scoring Methodology</h2>
        <p className="text-sm text-gray-600 mb-4">
          Scores are computed for every ticker tracked in any theme. The list
          refreshes hourly on weekdays via GitHub Actions and on demand via the
          Refresh button.
        </p>

        <h3 className="font-semibold mt-4 mb-2">Momentum Score (0–100)</h3>
        <p className="text-sm text-gray-600 mb-2">
          How strongly and persistently the stock has been trending — beyond the
          raw recent move.
        </p>
        <ul className="text-sm space-y-1">
          <li>• <strong>40 pts</strong> — 12-month return excluding the most recent month (academic momentum factor).</li>
          <li>• <strong>25 pts</strong> — Position in 52-week range (price near highs scores higher).</li>
          <li>• <strong>20 pts</strong> — Trend persistence: % of last 60 trading days where close &gt; 20-day SMA.</li>
          <li>• <strong>15 pts</strong> — Distance above 200-day SMA (capped at +50%).</li>
        </ul>

        <h3 className="font-semibold mt-4 mb-2">Technical Score (0–100)</h3>
        <p className="text-sm text-gray-600 mb-2">
          Whether the chart is in good shape today — entry/hold quality.
        </p>
        <ul className="text-sm space-y-1">
          <li>• <strong>30 pts</strong> — MA stack (price &gt; SMA20 &gt; SMA50 &gt; SMA200).</li>
          <li>• <strong>25 pts</strong> — RSI(14) (peaks at 50–70; penalized at extremes).</li>
          <li>• <strong>20 pts</strong> — MACD (line &gt; signal &gt; 0 = full score).</li>
          <li>• <strong>15 pts</strong> — Volume trend (20-day avg vs 60-day avg).</li>
          <li>• <strong>10 pts</strong> — ADX(14) trend strength.</li>
        </ul>

        <p className="text-xs text-gray-500 mt-4">
          Missing inputs contribute 0 to that factor (no renormalization). Rows
          where Yahoo data is partially missing are marked with a small ⓘ.
        </p>
      </DialogContent>
    </Dialog>
  );
}
```

If the Dialog primitive in this project has a different import path or API, adjust to match `MethodologyModal.tsx`'s usage.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/markets/scanner/stocks/_components/WatchlistMethodologyModal.tsx
git commit -m "feat(watchlist): add methodology modal"
```

---

## Task 10: WatchlistTable client component

**Files:**
- Create: `src/app/markets/scanner/stocks/_components/WatchlistTable.tsx`

The table renders rows from the page's server query, supports per-column sort, filter chips (market, momentum tier, 1WΔ positive, theme), and theme badges per row.

- [ ] **Step 1: Define the row type and props**

```tsx
"use client";

import { useMemo, useState } from "react";

export type WatchlistRow = {
  ticker: string;
  name: string;
  market: "US" | "SGX" | "HK" | "JP";
  price: number | null;
  momentumScore: number | null;
  technicalScore: number | null;
  priceChange1w: number | null;
  priceChange1m: number | null;
  priceChange3m: number | null;
  themeIds: number[];
  dataQuality: "ok" | "partial" | "failed";
};

export type ThemeNameMap = Record<number, string>;

type SortKey =
  | "momentumScore" | "technicalScore"
  | "priceChange1w" | "priceChange1m" | "priceChange3m"
  | "ticker" | "name";

type SortDir = "asc" | "desc";

interface Filters {
  markets: Set<"US" | "SGX" | "HK" | "JP">;
  momentumTier: "all" | "ge40" | "ge70";
  positive1wOnly: boolean;
  themeIds: Set<number>;
}

export function WatchlistTable({
  rows,
  themeNames,
}: {
  rows: WatchlistRow[];
  themeNames: ThemeNameMap;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("momentumScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filters, setFilters] = useState<Filters>({
    markets: new Set(),
    momentumTier: "all",
    positive1wOnly: false,
    themeIds: new Set(),
  });

  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const onHeader = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No tickers tracked yet. Add stocks to your themes on the{" "}
        <a href="/markets/scanner/themes" className="text-blue-600 underline">Themes</a> page.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilterBar filters={filters} setFilters={setFilters} themeNames={themeNames} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-gray-500">
              <Th label="Ticker"   active={sortKey === "ticker"}         dir={sortDir} onClick={() => onHeader("ticker")} />
              <Th label="Name"     active={sortKey === "name"}           dir={sortDir} onClick={() => onHeader("name")} />
              <Th label="Momentum" active={sortKey === "momentumScore"}  dir={sortDir} onClick={() => onHeader("momentumScore")} align="right" />
              <Th label="1W Δ"     active={sortKey === "priceChange1w"}  dir={sortDir} onClick={() => onHeader("priceChange1w")} align="right" />
              <Th label="1M Δ"     active={sortKey === "priceChange1m"}  dir={sortDir} onClick={() => onHeader("priceChange1m")} align="right" />
              <Th label="3M Δ"     active={sortKey === "priceChange3m"}  dir={sortDir} onClick={() => onHeader("priceChange3m")} align="right" />
              <Th label="Technical" active={sortKey === "technicalScore"} dir={sortDir} onClick={() => onHeader("technicalScore")} align="right" />
              <th className="px-2 py-2">Themes</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <Row key={r.ticker} row={r} themeNames={themeNames} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Showing {sorted.length} of {rows.length}
      </p>
    </div>
  );
}

function Th({ label, active, dir, onClick, align }: { label: string; active: boolean; dir: SortDir; onClick: () => void; align?: "left" | "right" }) {
  return (
    <th className={`px-2 py-2 cursor-pointer select-none ${align === "right" ? "text-right" : "text-left"}`} onClick={onClick}>
      <span className={active ? "text-gray-800" : ""}>{label}{active ? (dir === "desc" ? " ↓" : " ↑") : ""}</span>
    </th>
  );
}

function Row({ row, themeNames }: { row: WatchlistRow; themeNames: ThemeNameMap }) {
  const failed = row.dataQuality === "failed";
  return (
    <tr className={`border-b hover:bg-gray-50 ${failed ? "opacity-60" : ""}`}>
      <td className="px-2 py-2 font-mono">
        {failed && <span title="Fetch failed" className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5" />}
        {row.ticker}
      </td>
      <td className="px-2 py-2 max-w-[18rem] truncate" title={row.name}>{row.name}</td>
      <td className="px-2 py-2 text-right"><ScoreBadge value={row.momentumScore} /></td>
      <td className="px-2 py-2 text-right"><Delta value={row.priceChange1w} /></td>
      <td className="px-2 py-2 text-right"><Delta value={row.priceChange1m} /></td>
      <td className="px-2 py-2 text-right"><Delta value={row.priceChange3m} /></td>
      <td className="px-2 py-2 text-right"><ScoreBadge value={row.technicalScore} /></td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap gap-1">
          {row.themeIds.map((id) => (
            <span key={id} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
              {themeNames[id] ?? `#${id}`}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  const v = Math.round(value);
  const cls =
    v >= 70 ? "bg-green-100 text-green-800" :
    v >= 40 ? "bg-amber-100 text-amber-800" :
              "bg-gray-100 text-gray-700";
  return <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${cls}`}>{v}</span>;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  const cls = value > 0 ? "text-green-700" : value < 0 ? "text-red-700" : "text-gray-700";
  const sign = value > 0 ? "+" : "";
  return <span className={cls}>{sign}{value.toFixed(2)}%</span>;
}

function filterRows(rows: WatchlistRow[], f: Filters): WatchlistRow[] {
  return rows.filter((r) => {
    if (f.markets.size > 0 && !f.markets.has(r.market)) return false;
    if (f.momentumTier === "ge40" && (r.momentumScore ?? -1) < 40) return false;
    if (f.momentumTier === "ge70" && (r.momentumScore ?? -1) < 70) return false;
    if (f.positive1wOnly && !((r.priceChange1w ?? 0) > 0)) return false;
    if (f.themeIds.size > 0 && !r.themeIds.some((id) => f.themeIds.has(id))) return false;
    return true;
  });
}

function sortRows(rows: WatchlistRow[], key: SortKey, dir: SortDir): WatchlistRow[] {
  const mul = dir === "desc" ? -1 : 1;
  const out = [...rows];
  out.sort((a, b) => {
    const av = a[key as keyof WatchlistRow];
    const bv = b[key as keyof WatchlistRow];
    if (av === null || av === undefined) return 1;     // nulls always last
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    return String(av).localeCompare(String(bv)) * mul;
  });
  return out;
}

function FilterBar({
  filters, setFilters, themeNames,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  themeNames: ThemeNameMap;
}) {
  const markets: ("US" | "SGX" | "HK" | "JP")[] = ["US", "SGX", "HK", "JP"];
  const themeEntries = Object.entries(themeNames);

  const toggleMarket = (m: "US" | "SGX" | "HK" | "JP") => {
    const next = new Set(filters.markets);
    next.has(m) ? next.delete(m) : next.add(m);
    setFilters({ ...filters, markets: next });
  };
  const toggleTheme = (id: number) => {
    const next = new Set(filters.themeIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setFilters({ ...filters, themeIds: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-500">Market:</span>
      {markets.map((m) => (
        <Chip key={m} active={filters.markets.has(m)} onClick={() => toggleMarket(m)}>{m}</Chip>
      ))}

      <span className="text-gray-500 ml-3">Momentum:</span>
      {(["all", "ge40", "ge70"] as const).map((t) => (
        <Chip key={t} active={filters.momentumTier === t} onClick={() => setFilters({ ...filters, momentumTier: t })}>
          {t === "all" ? "All" : t === "ge40" ? "≥40" : "≥70"}
        </Chip>
      ))}

      <Chip active={filters.positive1wOnly} onClick={() => setFilters({ ...filters, positive1wOnly: !filters.positive1wOnly })}>
        1W positive
      </Chip>

      {themeEntries.length > 0 && (
        <>
          <span className="text-gray-500 ml-3">Theme:</span>
          {themeEntries.map(([id, name]) => (
            <Chip key={id} active={filters.themeIds.has(Number(id))} onClick={() => toggleTheme(Number(id))}>
              {name}
            </Chip>
          ))}
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded border ${active ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/markets/scanner/stocks/_components/WatchlistTable.tsx
git commit -m "feat(watchlist): add sortable, filterable table component"
```

---

## Task 11: Rewrite the page server component

**Files:**
- Modify (full rewrite): `src/app/markets/scanner/stocks/page.tsx`

- [ ] **Step 1: Write the new page**

```tsx
import type { Metadata } from "next";
import { db, watchlistScores, themes } from "@/db";
import { desc } from "drizzle-orm";
import { PageHero } from "@/components/PageHero";
import { RefreshButton } from "../_components/RefreshButton";
import { ScanAge } from "../_components/ScanAge";
import { WatchlistMethodologyModal } from "./_components/WatchlistMethodologyModal";
import { WatchlistTable, type WatchlistRow, type ThemeNameMap } from "./_components/WatchlistTable";

export const metadata: Metadata = {
  title: "Scanner – Stocks | Markets",
  description: "Watchlist of theme-tracked stocks with momentum + technical scores",
};

export const dynamic = "force-dynamic";

async function loadData(): Promise<{ rows: WatchlistRow[]; themeNames: ThemeNameMap; lastComputedAt: string | null }> {
  const [scoreRows, themeRows] = await Promise.all([
    db.select().from(watchlistScores).orderBy(desc(watchlistScores.momentumScore)),
    db.select({ id: themes.id, name: themes.name }).from(themes),
  ]);

  const rows: WatchlistRow[] = scoreRows.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    market: r.market as WatchlistRow["market"],
    price: r.price,
    momentumScore: r.momentumScore,
    technicalScore: r.technicalScore,
    priceChange1w: r.priceChange1w,
    priceChange1m: r.priceChange1m,
    priceChange3m: r.priceChange3m,
    themeIds: safeParseThemeIds(r.themeIds),
    dataQuality: r.dataQuality as WatchlistRow["dataQuality"],
  }));

  const themeNames: ThemeNameMap = Object.fromEntries(themeRows.map((t) => [t.id, t.name]));

  const lastComputedAt = scoreRows.length > 0
    ? scoreRows.reduce((max, r) => r.computedAt > max ? r.computedAt : max, scoreRows[0].computedAt)
    : null;

  return { rows, themeNames, lastComputedAt };
}

function safeParseThemeIds(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export default async function ScannerStocksPage() {
  const { rows, themeNames, lastComputedAt } = await loadData();

  return (
    <>
      <PageHero
        title="Stocks Watchlist"
        badge={<WatchlistMethodologyModal />}
        actionSlot={
          <div className="flex items-center sm:flex-col sm:items-end gap-2">
            <RefreshButton />
            {lastComputedAt && <ScanAge date={lastComputedAt} />}
          </div>
        }
      />
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <WatchlistTable rows={rows} themeNames={themeNames} />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke-test locally**

Run: `npm run dev`
In a browser, hit `http://localhost:3000/markets/scanner/stocks`.
Expected: the page loads. With no data yet (no rows in `watchlist_scores`), the empty state renders linking to `/markets/scanner/themes`. With data (after running the scanner), the table renders.

If you have not yet run the scanner: trigger `scripts/run-watchlist-scanner.ts` once locally with `TURSO_DATABASE_URL` set in `.env.local`:

Run: `npx tsx scripts/run-watchlist-scanner.ts`
Expected: stdout shows the JSON event line; the page now shows rows.

- [ ] **Step 4: Commit**

```bash
git add src/app/markets/scanner/stocks/page.tsx
git commit -m "feat(watchlist): rewrite scanner page as watchlist table"
```

---

## Task 12: Rewrite the ACP route

**Files:**
- Modify (full rewrite): `src/app/api/acp/stock-scan/route.ts`
- Create: `src/__tests__/api/acp-stock-scan.test.ts`

The route now reads from `watchlist_scores` and returns the slim shape defined in the spec. The `enhanced=true` parameter is removed; old callers sending it get the new shape regardless.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/api/acp-stock-scan.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeRows = [
  { ticker: "AAPL", name: "Apple", market: "US", price: 180, momentumScore: 82, technicalScore: 75, priceChange1w: 1.2, priceChange1m: 4.5, priceChange3m: 8.0, themeIds: "[1]", dataQuality: "ok", computedAt: "2026-05-03T12:00:00Z" },
  { ticker: "D05.SI", name: "DBS", market: "SGX", price: 35, momentumScore: 40, technicalScore: 50, priceChange1w: -0.5, priceChange1m: 1.0, priceChange3m: 2.0, themeIds: "[2]", dataQuality: "ok", computedAt: "2026-05-03T12:00:00Z" },
];
const fakeThemes = [{ id: 1, name: "AI" }, { id: 2, name: "SG Banks" }];

vi.mock("@/db", () => {
  const watchlistScores = { ticker: "ticker", momentumScore: "momentum_score" };
  const themes = { id: "id", name: "name" };
  return {
    db: {
      select: vi.fn().mockImplementation((...args: any[]) => ({
        from: vi.fn().mockImplementation((tbl: any) => ({
          orderBy: vi.fn().mockResolvedValue(fakeRows),
          // For themes (no orderBy)
          then: undefined,
        })),
      })),
    },
    watchlistScores,
    themes,
  };
});

import { POST, GET } from "@/app/api/acp/stock-scan/route";

function makeReq(body: any = {}) {
  return new Request("http://localhost/api/acp/stock-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/acp/stock-scan", () => {
  it("returns the new slim shape with all markets", async () => {
    const res = await POST(makeReq({ market: "ALL" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.picks).toHaveLength(2);
    const apple = body.data.picks.find((p: any) => p.ticker === "AAPL");
    expect(apple).toMatchObject({
      ticker: "AAPL",
      momentum_score: 82,
      technical_score: 75,
      change_1w: 1.2,
    });
    expect(apple).not.toHaveProperty("fundamentals"); // old enhanced fields removed
  });

  it("filters by market", async () => {
    const res = await POST(makeReq({ market: "SGX" }));
    const body = await res.json();
    expect(body.data.picks.every((p: any) => p.market === "SGX")).toBe(true);
  });

  it("filters by min_momentum", async () => {
    const res = await POST(makeReq({ min_momentum: 70 }));
    const body = await res.json();
    expect(body.data.picks.every((p: any) => p.momentum_score >= 70)).toBe(true);
  });

  it("ignores deprecated `enhanced` field", async () => {
    const res = await POST(makeReq({ enhanced: true }));
    expect(res.status).toBe(200); // no validation error
  });
});

describe("GET /api/acp/stock-scan", () => {
  it("returns the new self-description", async () => {
    const res = await GET(new Request("http://localhost/api/acp/stock-scan"));
    const body = await res.json();
    expect(body.version).toBe("3.0");
    expect(body.params).toHaveProperty("min_momentum");
    expect(body.params).not.toHaveProperty("enhanced");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/api/acp-stock-scan.test.ts`
Expected: FAIL — version still `2.0` or response shape mismatched.

- [ ] **Step 3: Rewrite the route**

Replace the entire contents of `src/app/api/acp/stock-scan/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, watchlistScores, themes } from "@/db";
import { desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

const requestSchema = z.object({
  market: z.string().toUpperCase().optional()
    .transform((v) => v ?? "ALL")
    .pipe(z.enum(["US", "SGX", "HK", "JP", "ALL"])),
  min_momentum: z.number().min(0).max(100).default(0),
  limit: z.number().min(1).max(100).default(50),
}).passthrough(); // ignore unknown fields (e.g. legacy `enhanced`)

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const params = requestSchema.parse(body);

    const [scoreRows, themeRows] = await Promise.all([
      db.select().from(watchlistScores).orderBy(desc(watchlistScores.momentumScore)),
      db.select({ id: themes.id, name: themes.name }).from(themes),
    ]);

    const themeNameById = new Map(themeRows.map((t) => [t.id, t.name]));

    let filtered = scoreRows.filter((r) => (r.momentumScore ?? -1) >= params.min_momentum);
    if (params.market !== "ALL") {
      filtered = filtered.filter((r) => r.market === params.market);
    }
    filtered = filtered.slice(0, params.limit);

    const picks = filtered.map((r) => {
      let themeIds: number[] = [];
      try { themeIds = JSON.parse(r.themeIds); } catch { /* ignore */ }
      return {
        ticker: r.ticker,
        name: r.name,
        market: r.market,
        price: r.price,
        momentum_score: r.momentumScore,
        technical_score: r.technicalScore,
        change_1w: r.priceChange1w,
        change_1m: r.priceChange1m,
        change_3m: r.priceChange3m,
        themes: themeIds.map((id) => themeNameById.get(id) ?? `#${id}`),
        data_quality: r.dataQuality,
      };
    });

    const lastComputedAt = scoreRows.length > 0
      ? scoreRows.reduce((max, r) => r.computedAt > max ? r.computedAt : max, scoreRows[0].computedAt)
      : new Date().toISOString();

    return NextResponse.json({
      success: true,
      data: {
        scan_timestamp: lastComputedAt,
        count: picks.length,
        picks,
      },
      meta: {
        request_id: requestId,
        processing_time_ms: Date.now() - startTime,
        pricing: "$0.20 per request",
      },
    });
  } catch (err) {
    logger.error("acp/stock-scan", "Request failed", { error: err, requestId });
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: err.issues[0]?.message ?? "Invalid request" }, meta: { request_id: requestId } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Processing failed" }, meta: { request_id: requestId } },
      { status: 500 }
    );
  }
}

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    endpoint: "/api/acp/stock-scan",
    method: "POST",
    description: "Returns the Claudius watchlist of theme-tracked tickers with momentum and technical scores.",
    version: "3.0",
    params: {
      market: "US | SGX | HK | JP | ALL (default: ALL)",
      min_momentum: "Minimum momentum score 0-100 (default: 0)",
      limit: "Max results, 1-100 (default: 50)",
    },
    pricing: "$0.20 per request",
    response_fields: ["ticker", "name", "market", "price", "momentum_score", "technical_score", "change_1w", "change_1m", "change_3m", "themes", "data_quality"],
    methodology: {
      momentum_score: "0-100; weighted blend of 12-1M return (40), 52w range position (25), trend persistence (20), distance above 200-SMA (15)",
      technical_score: "0-100; weighted blend of MA stack (30), RSI (25), MACD (20), volume trend (15), ADX (10)",
    },
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/api/acp-stock-scan.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/acp/stock-scan/route.ts src/__tests__/api/acp-stock-scan.test.ts
git commit -m "feat(acp): rewire stock-scan endpoint to watchlist_scores"
```

---

## Task 13: End-to-end smoke verification

This task runs no code changes — it verifies the integrated system works before opening the PR.

- [ ] **Step 1: Full type check + test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no TypeScript errors; all tests pass.

- [ ] **Step 2: Trigger a real scanner run locally**

Ensure `.env.local` has `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Then:

Run: `npx tsx scripts/run-watchlist-scanner.ts`
Expected: stdout shows `{"event":"watchlist_run_complete", ...}` with non-zero `tickersProcessed` (assuming the local DB has theme_stocks rows). Exit code 0.

If no theme_stocks exist locally, seed at least one for the smoke check:
Run: `sqlite3 <local-db-or-equivalent> "INSERT INTO themes (name) VALUES ('Smoke'); INSERT INTO theme_stocks (theme_id, ticker) VALUES ((SELECT id FROM themes WHERE name='Smoke'), 'AAPL');"`

- [ ] **Step 3: Visit the page**

Run: `npm run dev`
Open `http://localhost:3000/markets/scanner/stocks`.
Expected: AAPL row appears with momentum and technical scores, 1W/1M/3M deltas, the "Smoke" theme badge, and an "as of … ago" timestamp. Sort by clicking each header. Toggle a market chip. Toggle the theme chip.

- [ ] **Step 4: Click Refresh**

Click the Refresh button.
Expected: spinner appears briefly; toast says "Refreshed N tickers"; the row's `computedAt` updates (visible via age stamp).

- [ ] **Step 5: Hit the ACP endpoint**

Run:
```bash
curl -s -X POST http://localhost:3000/api/acp/stock-scan -H "Content-Type: application/json" -d '{"market":"ALL"}' | jq .
```
Expected: JSON with `success: true`, `data.picks` containing AAPL with the new field names (`momentum_score`, `change_1w`, `themes`, etc.), no `fundamentals` block.

- [ ] **Step 6: Verify the old GH cron is disabled**

Run: `grep -A5 "^on:" .github/workflows/scanner.yml`
Expected: only `workflow_dispatch:` is present; no `schedule:` block.

- [ ] **Step 7: Open the PR**

Push the branch and open a PR titled `feat: replace universe scanner with watchlist`. Include the spec link in the PR description and call out the breaking change to the ACP endpoint.

---

## Self-review checklist (run before declaring the plan ready)

- Spec coverage: every spec section maps to a task above (data model → T1; 1w price → T2; scoring → T3; orchestrator → T4; cron → T5+T6; on-demand refresh → T7+T8; UI → T9+T10+T11; ACP → T12; smoke → T13). ✓
- No placeholders: the only `// FILL` markers are inside Task 4 Step 4 and are explicitly resolved by Task 4 Step 5. ✓
- Type consistency: `WatchlistRow` (T10), `WatchlistScore` (T1), `ScoringInputs` (T3) — names align across tasks. The orchestrator returns `ComputeResult` shape used by both API route (T7) and CLI (T5). ✓
- Auth: T7 endpoint takes a bearer key (cron-only); T8 adds a session-gated proxy for the browser button. Resolves the "key cannot ship to client" issue. ✓
