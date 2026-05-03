# Watchlist Scanner — Design Spec

**Date:** 2026-05-03
**Status:** Draft, awaiting review
**Replaces:** Universe-wide stock scanner at `/markets/scanner/stocks` (universe scan ~1k tickers across 5 markets, 6h cron, scored via `mode-scoring.ts` mode-coupled formulas)

---

## Problem

The current `/markets/scanner/stocks` page surfaces a 5-market universe scan that the user does not find useful. The page is heavy to compute, mode-coupled in ways that obscure the signal, and disconnected from the curated themes the user actually tracks. Replace it with a watchlist view scoped to tickers already in the user's themes, with a small set of clear scoring columns.

## Goals

- Show every ticker present in any theme (deduped), with momentum and technical scoring that adds signal beyond raw price deltas.
- Refresh hourly on weekdays via GitHub Actions.
- Keep the compute path single-sourced (one library used by the cron).
- Rewire the paid ACP offering at `/api/acp/stock-scan` to serve the new (slimmer) shape.
- Drop the dead universe-scan pipeline.

## Non-goals

- Per-ticker detail pages (none exist; deferred).
- Score history / sparklines (not required for v1; the schema makes adding them straightforward later).
- Adding stocks to themes from the watchlist UI (out of scope; theme management lives on `/markets/scanner/themes`).
- Backtesting the new score formulas before launch (the user has no formula preference; we ship a defensible default and tune later).

---

## Watchlist composition

- **Source:** every distinct `ticker` in `theme_stocks`, regardless of `status`. A ticker that appears in multiple themes appears once.
- **Theme attribution:** for each ticker we record the set of theme IDs it belongs to so the UI can render badges.
- **Market detection:** derived from the Yahoo-normalized ticker suffix (`.SI` → SGX, `.HK` → HK, `.T` → JP, none → US). `src/lib/yahoo-utils.ts:normalizeTickerForYahoo` already handles this.

---

## Scoring

Both scores are normalized to 0–100. Inputs all come from existing `enhanced-metrics.ts` / `yahoo-fetcher.ts` outputs; no new data sources.

### Momentum Score (0–100)

"Is this trending strongly and persistently — beyond the raw recent move?"

| Factor | Weight | Definition |
|---|---|---|
| 12-1M return | 40 | Trailing 12-month return excluding the most recent month (academic momentum factor). Maps to 0–40 via piecewise: ≥30% → 40, ≥15% → 28, ≥0% → 16, ≥-10% → 8, else 0. |
| 52w range position | 25 | `(price − low52w) / (high52w − low52w)`, scaled 0–25. |
| Trend persistence | 20 | % of last 60 trading days where close > 20-day SMA, scaled 0–20. |
| Distance above 200-day SMA | 15 | `(price − SMA200) / SMA200`, capped at +50%. Maps to 0–15. |

Rationale for excluding raw 1M/3M from the score: those columns are already shown adjacent to it. The score must add information, not duplicate columns.

### Technical Score (0–100)

"Is the chart in good shape right now — would you be comfortable holding/entering today?"

| Factor | Weight | Definition |
|---|---|---|
| MA stack | 30 | 30 if price > SMA20 > SMA50 > SMA200; 20 if 3 of 4 ordered correctly; 10 if 2; 0 otherwise. |
| RSI(14) | 25 | Peak at 50–70 (=25); 40–50 or 70–75 → 18; 30–40 or 75–80 → 10; <30 or >80 → 0. |
| MACD | 20 | MACD line above signal AND above zero → 20; above signal only → 12; below signal but above zero → 6; both negative → 0. |
| Volume trend | 15 | `(avg20dVol / avg60dVol) − 1`. ≥+30% → 15; ≥+10% → 10; ≥0 → 6; negative → 0. |
| ADX(14) | 10 | ≥40 → 10; ≥25 → 7; ≥15 → 3; <15 → 0. |

### Missing-data behavior

If any factor's input is missing, that factor contributes 0 and the score is *not* renormalized. The row carries `data_quality = 'partial'` and the UI dims the score with a tooltip naming the missing factor. If price itself is missing or the Yahoo fetch fails, `data_quality = 'failed'`, scores are null, and the row still renders so the user knows it's broken.

---

## Architecture

### Single source of truth: shared scoring library

```
src/lib/scanner/watchlist.ts
  ├── computeWatchlistScores(): runs end-to-end (fetch theme tickers → fetch Yahoo data → score → upsert into watchlist_scores)
  ├── scoreMomentum(metrics): pure function
  └── scoreTechnical(metrics): pure function
```

Pure scoring functions are unit-tested with fixed inputs; the orchestration function is integration-tested against a small fake DB / mocked Yahoo client.

### Single caller: scheduled GitHub Action

`.github/workflows/watchlist-scanner.yml` runs `scripts/run-watchlist-scanner.ts`
which calls `computeWatchlistScores()`. Cron: every hour at :05 on Mon–Fri (UTC).
After successful write, posts to `/api/scanner/revalidate` to bust the page cache.

No on-demand browser-initiated refresh path. The compute is too slow
(~150s for ~500 tickers via Yahoo) to fit Vercel Hobby's 60s serverless cap,
and the data cadence (momentum/technical scoring) doesn't justify the cost
of moving it onto a worker provider. If a user needs an off-cycle refresh,
they can `gh workflow run watchlist-scanner.yml` from the CLI.

### Data flow

```
theme_stocks → computeWatchlistScores() → Yahoo (batched) → upsert watchlist_scores → /markets/scanner/stocks (server component reads DB)
```

---

## Database

### New table

```sql
watchlist_scores (
  ticker            TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  market            TEXT NOT NULL,            -- 'US' | 'SGX' | 'HK' | 'JP'
  price             REAL,
  momentum_score    REAL,                     -- 0-100, null if data_quality='failed'
  technical_score   REAL,                     -- 0-100, null if data_quality='failed'
  price_change_1w   REAL,                     -- pct, signed
  price_change_1m   REAL,                     -- pct, signed
  price_change_3m   REAL,                     -- pct, signed
  theme_ids         TEXT NOT NULL,            -- JSON array of theme IDs
  data_quality      TEXT NOT NULL,            -- 'ok' | 'partial' | 'failed'
  computed_at       TEXT NOT NULL             -- ISO timestamp
);
CREATE INDEX idx_watchlist_scores_market ON watchlist_scores(market);
```

One row per ticker. Each refresh is an upsert, so the table size equals the watchlist size. Tickers removed from all themes are deleted in the same transaction (the refresh job knows the canonical set).

### Dropped

- Table `stock_scans` — drop in the same migration.
- All `stock_scans` rows are discarded.

### One new computation needed: 1-week price change

`enhanced-metrics.ts` computes 1m/3m/6m/YTD but not 1w. Add `priceChange1w` to the same function (5 trading days back).

---

## UI

### Page

`src/app/markets/scanner/stocks/page.tsx` becomes a server component that:

1. Reads all rows from `watchlist_scores` ordered by `momentum_score DESC NULLS LAST`.
2. Reads `themes` (id → name) for badge labels.
3. Reads the max `computed_at` to display "as of X ago" via the `ScanAge` component.
4. Renders the new `<WatchlistTable>` client component with the rows.

Replaces use of `MethodologyModal` with a new `WatchlistMethodologyModal` describing the new score formulas (the old one describes the now-deleted unified scan).

### Table component

New file `src/app/markets/scanner/stocks/_components/WatchlistTable.tsx`. Client component because it needs sort and filter state.

**Columns:**

| # | Column | Notes |
|---|---|---|
| 1 | Ticker | Display normalized form (`D05.SI`, not `D05`). Plain text for v1 (no detail page exists). |
| 2 | Name | Truncate at ~30 chars with ellipsis; full name in tooltip. |
| 3 | Momentum Score | 0–100, color-graded badge: green ≥70, amber 40–69, gray <40. |
| 4 | 1WΔ | Percent, signed, green/red. |
| 5 | 1MΔ | As above. |
| 6 | 3MΔ | As above. |
| 7 | Technical Score | Same color rules as Momentum Score. |
| 8 | Themes | Stacked badges, one per theme membership. Click badge → filters table to that theme. |

**Behaviors:**

- All columns sortable (click header to toggle asc/desc; default sort: Momentum Score desc).
- Filter chips above the table:
  - Market: All / US / SGX / HK / JP (multi-select).
  - Momentum: ≥70 / ≥40 / All.
  - 1WΔ: Positive only / All.
  - Theme: All / *theme name* (multi-select).
- Rows with `data_quality = 'failed'` render with a red dot and dashed-out scores.
- Rows with `data_quality = 'partial'` render scores at normal opacity but with a small ⓘ tooltip listing missing inputs.
- Empty state (no theme stocks tracked yet): message linking to `/markets/scanner/themes`.

---

## ACP rewire

`/api/acp/stock-scan` (POST) is rewritten to read from `watchlist_scores` and return the same shape the UI shows.

### New request schema

```ts
{
  market?: 'US' | 'SGX' | 'HK' | 'JP' | 'ALL'  // default 'ALL'
  min_momentum?: number  // 0-100, default 0
  limit?: number         // 1-100, default 50
}
```

### New response shape

```ts
{
  success: true,
  data: {
    scan_timestamp: string,    // max(computed_at)
    count: number,
    picks: Array<{
      ticker: string,
      name: string,
      market: 'US' | 'SGX' | 'HK' | 'JP',
      price: number,
      momentum_score: number,  // 0-100
      technical_score: number, // 0-100
      change_1w: number,
      change_1m: number,
      change_3m: number,
      themes: string[],        // theme names
      data_quality: 'ok' | 'partial' | 'failed'
    }>
  },
  meta: {
    request_id: string,
    pricing: '$0.20 per request',
    methodology_url: 'https://hq.claudiusinc.com/api/acp/stock-scan' // GET handler returns full doc
  }
}
```

The `enhanced=true` mode and all its enriched fields (sector, fundamentals, earnings, ownership, analyst_consensus, relative_strength) are removed. This is a breaking change to the ACP offering. Documenting this is a deploy-time concern.

The `GET /api/acp/stock-scan` self-description handler is updated to describe the new shape.

---

## What gets deleted

| Item | Reason |
|---|---|
| `scripts/run-scanner.ts` | Universe scan orchestrator — replaced by `run-watchlist-scanner.ts`. |
| `.github/workflows/scanner.yml` | Replaced by `watchlist-scanner.yml`. |
| `src/lib/scanner/refresh.ts` | Universe-scan refresh logic; the new shared lib supersedes it. |
| `src/lib/scanner/mode-scoring.ts` | Mode-coupled scoring no longer used. (Verify no other importers; if any, port the function or keep as lib-only.) |
| `src/app/api/scanner/trigger`, `src/app/api/scanner/universe`, `src/app/api/scanner/universe/seed` | Universe management endpoints; not needed by the new scanner. |
| `src/app/api/markets/scanner/refresh` | Replaced by `.../watchlist/refresh`. |
| `src/app/api/stocks/scans/route.ts`, `src/app/api/stocks/scans/[type]/route.ts` | Public scan-read APIs tied to `stock_scans`. |
| `src/app/markets/scanner/_components/ScannerResults.tsx` and types it owns | Replaced by `WatchlistTable`. |
| `src/app/markets/scanner/_components/MethodologyModal.tsx` | Replaced by `WatchlistMethodologyModal`. |
| Table `stock_scans` | Migration drops it. |
| `src/app/markets/scanner/_components/RefreshButton.tsx` | On-demand path removed. Transient — created and deleted within this PR. |
| `src/app/api/markets/scanner/watchlist/refresh-proxy/route.ts` | On-demand path removed. Transient — created and deleted within this PR. |
| `src/app/api/markets/scanner/watchlist/refresh/route.ts` | On-demand path removed. Transient — created and deleted within this PR. |

The Yahoo fetcher (`yahoo-fetcher.ts`) and `enhanced-metrics.ts` are kept — they are reused by the sectors page and by the new watchlist library.

---

## Migration & rollout

1. **PR 1 (this spec):** schema migration adds `watchlist_scores`, drops `stock_scans`. Build the shared library, the GH Action, the API route, the new page UI, the ACP rewrite. Old workflow disabled in the same PR (set `on:` to manual-only) so the cron stops immediately on merge.
2. **First run after merge:** trigger `watchlist-scanner.yml` manually. Verify rows appear. Smoke-test the page and the ACP endpoint.
3. **Cleanup PR (follow-up):** delete the files listed under "What gets deleted" once the new system has been live for 24h with no rollback.

Splitting the cleanup into a follow-up PR keeps the rollback path simple: revert PR 1 if anything goes sideways and the universe scanner code is still on disk.

---

## Edge cases & tests

- Theme stock list is empty → page renders empty state, scanner job exits early (no API calls).
- Single ticker fetch fails → row gets `data_quality = 'failed'`, the rest of the run completes.
- Per-ticker fetch failures → that row is upserted with `data_quality = 'failed'`. Other rows succeed normally.
- All Yahoo calls in a run fail (rate limit, outage) → job exits 1 *before* any upsert (don't replace good rows with all-failed rows). Last good rows + `computed_at` remain visible on the page.
- Ticker exists in `theme_stocks` but Yahoo doesn't recognize it → `data_quality = 'failed'`, name falls back to ticker.
- 1Y of history not available (newly listed stock) → 12-1M factor = 0; `data_quality = 'partial'`.
- Theme membership changes between runs → `theme_ids` in `watchlist_scores` is replaced wholesale on each refresh; deletes happen in the same transaction.
- ACP caller sends old `enhanced=true` field → schema validation ignores it; response is the new slim shape regardless. (Breaking change is documented in the GET self-description.)

### Unit tests

- `scoreMomentum()` table-driven against ~10 hand-built metric inputs covering boundary conditions.
- `scoreTechnical()` same approach.
- `computePriceChange1w()` against a fixed historical bar series.

### Integration tests

- `computeWatchlistScores()` against a fake DB seeded with 3 themes / 5 tickers, with a mocked Yahoo client returning canned bars. Asserts: correct rows written, correct theme_ids, correct data_quality values for the failed-fetch ticker.

---

## Open questions parked for later

- Score backtest / weight tuning. Ship the spec'd weights first, then evaluate.
- Score history (sparkline column). Schema-friendly to add (`watchlist_score_history` table with daily snapshots).
- Per-ticker detail page. Out of scope; revisit when the table feels too dense.
- ACP pricing under the new (simpler) offering. Out of scope for engineering; flag to user before merge.
- On-demand refresh path. Deferred. Right answer is probably an Inngest/QStash worker or a tiny Fly.io background process. Hourly cron is sufficient for now.
