-- ============================================================================
-- ACP Experimentation Tracking Schema
-- Migration: add_acp_experimentation
-- Date: 2026-03-09
-- ============================================================================

-- ============================================================================
-- 1. Offering Experiments — Track A/B tests on offerings
-- ============================================================================

CREATE TABLE IF NOT EXISTS acp_offering_experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offering_id INTEGER,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  description TEXT,
  hypothesis TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'retired')),
  start_date TEXT DEFAULT (datetime('now')),
  end_date TEXT,
  results_summary TEXT,
  control_offering_id INTEGER,
  variant_label TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (offering_id) REFERENCES acp_offerings(id) ON DELETE SET NULL,
  FOREIGN KEY (control_offering_id) REFERENCES acp_offering_experiments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_acp_offering_experiments_status ON acp_offering_experiments(status);
CREATE INDEX IF NOT EXISTS idx_acp_offering_experiments_offering_id ON acp_offering_experiments(offering_id);

-- ============================================================================
-- 2. Daily Offering Metrics — Time-series performance data
-- ============================================================================

CREATE TABLE IF NOT EXISTS acp_offering_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offering_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  jobs_count INTEGER DEFAULT 0,
  revenue REAL DEFAULT 0,
  unique_buyers INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  conversion_rate REAL,
  avg_completion_time_ms INTEGER,
  failure_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (offering_id) REFERENCES acp_offerings(id) ON DELETE CASCADE,
  UNIQUE(offering_id, date)
);

CREATE INDEX IF NOT EXISTS idx_acp_offering_metrics_date ON acp_offering_metrics(date);
CREATE INDEX IF NOT EXISTS idx_acp_offering_metrics_offering_id ON acp_offering_metrics(offering_id);

-- ============================================================================
-- 3. Price Experiments — Track price changes and their impact
-- ============================================================================

CREATE TABLE IF NOT EXISTS acp_price_experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offering_id INTEGER NOT NULL,
  old_price REAL NOT NULL,
  new_price REAL NOT NULL,
  changed_at TEXT DEFAULT (datetime('now')),
  reason TEXT,
  jobs_before_7d INTEGER,
  jobs_after_7d INTEGER,
  revenue_before_7d REAL,
  revenue_after_7d REAL,
  revenue_delta REAL,
  conversion_before REAL,
  conversion_after REAL,
  status TEXT DEFAULT 'measuring' CHECK(status IN ('measuring', 'complete', 'reverted')),
  evaluation_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (offering_id) REFERENCES acp_offerings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_acp_price_experiments_offering_id ON acp_price_experiments(offering_id);
CREATE INDEX IF NOT EXISTS idx_acp_price_experiments_changed_at ON acp_price_experiments(changed_at);

-- ============================================================================
-- 4. Competitor Tracking — Monitor competitor offerings
-- ============================================================================

CREATE TABLE IF NOT EXISTS acp_competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  agent_wallet TEXT,
  offering_name TEXT NOT NULL,
  price REAL NOT NULL,
  description TEXT,
  category TEXT,
  jobs_count INTEGER DEFAULT 0,
  total_revenue REAL,
  is_active INTEGER DEFAULT 1,
  first_seen TEXT DEFAULT (datetime('now')),
  last_checked TEXT DEFAULT (datetime('now')),
  notes TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(agent_wallet, offering_name)
);

CREATE INDEX IF NOT EXISTS idx_acp_competitors_agent_wallet ON acp_competitors(agent_wallet);
CREATE INDEX IF NOT EXISTS idx_acp_competitors_category ON acp_competitors(category);
CREATE INDEX IF NOT EXISTS idx_acp_competitors_price ON acp_competitors(price);

-- ============================================================================
-- 5. Competitor Snapshots — Historical tracking of competitor changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS acp_competitor_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL,
  price REAL NOT NULL,
  jobs_count INTEGER,
  description TEXT,
  snapshot_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (competitor_id) REFERENCES acp_competitors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_acp_competitor_snapshots_competitor_id ON acp_competitor_snapshots(competitor_id);
CREATE INDEX IF NOT EXISTS idx_acp_competitor_snapshots_snapshot_at ON acp_competitor_snapshots(snapshot_at);
