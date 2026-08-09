-- S&P 500 constituent dataset for the daily note — see docs/daily-note-spec.md §3/§5/§8.
--
-- Two SPDR sources are joined here because neither file has both facts:
--   * GICS sector  — from the 11 Select Sector SPDR holdings files (each file IS
--     one sector; their own "Sector" column is unpopulated, so membership is the
--     signal, and together they partition the index).
--   * spy_weight   — the float-adjusted index weight from SPY's holdings file.
--     Full market cap is NOT a substitute: it is float-unadjusted and can flip
--     the sign of the index-contribution claim on a near-flat day.
--
-- Refreshed (and pruned for rebalances) by scripts/seed/sp500-constituents.ts.

CREATE TABLE IF NOT EXISTS sp500_constituents (
  ticker TEXT PRIMARY KEY,
  name TEXT,
  sector_etf TEXT NOT NULL,           -- XLK, XLF, XLY, XLC, XLV, XLI, XLP, XLE, XLB, XLRE, XLU
  spy_weight REAL,                    -- percent of SPY, NULL if absent from SPY's file
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sp500_constituents_sector ON sp500_constituents(sector_etf);
