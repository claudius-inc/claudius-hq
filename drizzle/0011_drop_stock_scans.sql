-- ============================================================================
-- Migration 0011: drop the `stock_scans` table.
--
-- The pre-watchlist scanner V1 pipeline wrote to `stock_scans` (one row per
-- scan, results JSON-blobbed). Since the V2 watchlist scanner shipped, the
-- live UI reads `ticker_metrics` instead and nothing reads from `stock_scans`
-- anymore. Drop the table; the V1 code (`runScannerRefresh`, `ScannerResults`,
-- the `/api/markets/scanner/*` and `/api/stocks/scans/*` routes) is being
-- deleted in the same commit.
-- ============================================================================

DROP TABLE IF EXISTS stock_scans;
