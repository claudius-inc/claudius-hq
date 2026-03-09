-- ============================================================================
-- ACP Operations Control Plane Tables
-- Migration: add_acp_operations.sql
-- Created: 2026-03-09
-- Description: Central state management for ACP strategy, tasks, and decisions
-- ============================================================================

-- Core state table (single row, updated frequently)
-- Stores the current operational state for ACP
CREATE TABLE IF NOT EXISTS acp_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_pillar TEXT NOT NULL DEFAULT 'quality', -- quality, replace, build, experiment
  current_epoch INTEGER,
  epoch_start TEXT,
  epoch_end TEXT,
  jobs_this_epoch INTEGER DEFAULT 0,
  revenue_this_epoch REAL DEFAULT 0,
  -- Goals
  target_jobs INTEGER,
  target_revenue REAL,
  target_rank INTEGER,
  -- Server status
  server_running INTEGER DEFAULT 1,
  server_pid INTEGER,
  last_heartbeat TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Ensure only one row exists (singleton pattern)
INSERT OR IGNORE INTO acp_state (id, current_pillar) VALUES (1, 'quality');

-- Strategy parameters (key-value store for flexibility)
-- Allows dynamic configuration without schema changes
CREATE TABLE IF NOT EXISTS acp_strategy (
  id TEXT PRIMARY KEY, -- e.g., "pricing.default_multiplier"
  category TEXT, -- pricing, offerings, marketing, experiments
  key TEXT NOT NULL,
  value TEXT, -- JSON allowed for complex values
  notes TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Task queue (what needs to be done)
-- Priority-based task management for heartbeat/cron execution
CREATE TABLE IF NOT EXISTS acp_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pillar TEXT NOT NULL, -- quality, replace, build, experiment
  priority INTEGER DEFAULT 50, -- 0-100, higher = more urgent
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, in_progress, done, skipped
  assigned_at TEXT,
  completed_at TEXT,
  result TEXT, -- JSON or text summary of outcome
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for task queries
CREATE INDEX IF NOT EXISTS idx_acp_tasks_status ON acp_tasks(status);
CREATE INDEX IF NOT EXISTS idx_acp_tasks_pillar ON acp_tasks(pillar);
CREATE INDEX IF NOT EXISTS idx_acp_tasks_priority ON acp_tasks(priority DESC);

-- Decision log (why decisions were made)
-- Audit trail for strategic decisions
CREATE TABLE IF NOT EXISTS acp_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_type TEXT, -- pricing, offering_change, strategy_shift, experiment
  offering TEXT, -- offering name if applicable
  old_value TEXT, -- JSON or text
  new_value TEXT, -- JSON or text
  reasoning TEXT, -- Why this decision was made
  outcome TEXT, -- What happened after (filled in later)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for recent decisions
CREATE INDEX IF NOT EXISTS idx_acp_decisions_created ON acp_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acp_decisions_type ON acp_decisions(decision_type);

-- Marketing campaigns
-- Track social posts and their attribution to job conversions
CREATE TABLE IF NOT EXISTS acp_marketing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT, -- twitter, discord, telegram
  content TEXT NOT NULL,
  target_offering TEXT, -- which offering this promotes
  status TEXT DEFAULT 'draft', -- draft, scheduled, posted, analyzed
  scheduled_at TEXT,
  posted_at TEXT,
  tweet_id TEXT, -- external ID for tracking
  engagement_likes INTEGER DEFAULT 0,
  engagement_retweets INTEGER DEFAULT 0,
  engagement_replies INTEGER DEFAULT 0,
  jobs_attributed INTEGER DEFAULT 0, -- jobs that came from this post
  revenue_attributed REAL DEFAULT 0, -- revenue from attributed jobs
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for marketing queries
CREATE INDEX IF NOT EXISTS idx_acp_marketing_status ON acp_marketing(status);
CREATE INDEX IF NOT EXISTS idx_acp_marketing_channel ON acp_marketing(channel);
