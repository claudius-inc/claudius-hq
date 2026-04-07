-- ============================================================================
-- Gavekal Historical Snapshot — materialized monthly regime/ratio view
-- Migration: add_gavekal_historical_snapshot
-- Date: 2026-04-07
--
-- Stores the precomputed output of computeHistoricalSeries() so the cold-path
-- of /api/markets/gavekal doesn't have to recompute the 84-month MA + regime
-- classification across ~700 monthly rows on every cache miss.
-- Past months are immutable, so this acts as a true materialized view.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gavekal_historical_snapshot (
  date           TEXT PRIMARY KEY,           -- YYYY-MM-DD, first of month
  energy_ratio   REAL NOT NULL,              -- S&P 500 / WTI (monthly)
  currency_ratio REAL NOT NULL,              -- 10y UST / Gold (monthly)
  energy_ma      REAL,                       -- 84-month MA, NULL during warmup
  currency_ma    REAL,                       -- 84-month MA, NULL during warmup
  regime         TEXT NOT NULL,              -- "Inflationary Boom" | etc.
  created_at     TEXT DEFAULT (datetime('now'))
);
