import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default db;

// Auto-init: run migrations on first import (lazy, runs once)
let _initPromise: Promise<void> | null = null;
export function ensureDB(): Promise<void> {
  if (!_initPromise) {
    _initPromise = initDB().catch((e) => {
      console.error("DB init failed:", e);
      _initPromise = null; // retry next time
    });
  }
  return _initPromise;
}

export async function initDB() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog','in_progress','blocked','done')),
      phase TEXT DEFAULT 'build' CHECK(phase IN ('research','build','live')),
      repo_url TEXT DEFAULT '',
      deploy_url TEXT DEFAULT '',
      test_count INTEGER DEFAULT 0,
      build_status TEXT DEFAULT 'unknown' CHECK(build_status IN ('pass','fail','unknown')),
      last_deploy_time TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      source TEXT DEFAULT '',
      market_notes TEXT DEFAULT '',
      effort_estimate TEXT DEFAULT 'unknown' CHECK(effort_estimate IN ('tiny','small','medium','large','huge','unknown')),
      potential TEXT DEFAULT 'unknown' CHECK(potential IN ('low','medium','high','moonshot','unknown')),
      status TEXT DEFAULT 'new' CHECK(status IN ('new','researching','validated','promoted','rejected')),
      promoted_to_project_id INTEGER REFERENCES projects(id),
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      report_type TEXT NOT NULL DEFAULT 'sun-tzu',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS research_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, slug)
    );

    CREATE TABLE IF NOT EXISTS research_jobs (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','complete','failed')),
      progress INTEGER DEFAULT 0,
      error_message TEXT DEFAULT NULL,
      report_id INTEGER REFERENCES stock_reports(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Watchlist: staging area for stocks being monitored
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      target_price REAL,
      notes TEXT,
      status TEXT DEFAULT 'watching' CHECK(status IN ('watching', 'accumulating', 'graduated')),
      added_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Portfolio holdings: single evolving portfolio
    CREATE TABLE IF NOT EXISTS portfolio_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      target_allocation REAL NOT NULL,
      cost_basis REAL,
      shares REAL,
      added_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Portfolio analysis reports (historical)
    CREATE TABLE IF NOT EXISTS portfolio_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      summary TEXT,
      total_tickers INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Investment themes (basket of stocks to track together)
    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Stocks belonging to themes
    CREATE TABLE IF NOT EXISTS theme_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
      ticker TEXT NOT NULL,
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(theme_id, ticker)
    );
  `);

  // Add phase column to existing projects table if missing
  try {
    await db.execute("SELECT phase FROM projects LIMIT 1");
  } catch {
    await db.execute("ALTER TABLE projects ADD COLUMN phase TEXT DEFAULT 'build' CHECK(phase IN ('idea','research','build','launch','grow','iterate','maintain'))");
  }

  // Add target_audience and action_plan columns if missing
  try {
    await db.execute("SELECT target_audience FROM projects LIMIT 1");
  } catch {
    await db.execute("ALTER TABLE projects ADD COLUMN target_audience TEXT DEFAULT ''");
  }
  try {
    await db.execute("SELECT action_plan FROM projects LIMIT 1");
  } catch {
    await db.execute("ALTER TABLE projects ADD COLUMN action_plan TEXT DEFAULT ''");
  }

  // Add company_name column to stock_reports if missing
  try {
    await db.execute("SELECT company_name FROM stock_reports LIMIT 1");
  } catch {
    await db.execute("ALTER TABLE stock_reports ADD COLUMN company_name TEXT DEFAULT ''");
  }

  // Add related_tickers column for comparison reports
  try {
    await db.execute("SELECT related_tickers FROM stock_reports LIMIT 1");
  } catch {
    await db.execute("ALTER TABLE stock_reports ADD COLUMN related_tickers TEXT DEFAULT ''");
  }

  // Add watchlist-like fields to theme_stocks
  try {
    await db.execute("SELECT target_price FROM theme_stocks LIMIT 1");
  } catch {
    await db.execute("ALTER TABLE theme_stocks ADD COLUMN target_price REAL");
  }
  try {
    await db.execute("SELECT status FROM theme_stocks LIMIT 1");
  } catch {
    await db.execute("ALTER TABLE theme_stocks ADD COLUMN status TEXT DEFAULT 'watching' CHECK(status IN ('watching', 'accumulating', 'holding'))");
  }
  try {
    await db.execute("SELECT notes FROM theme_stocks LIMIT 1");
  } catch {
    await db.execute("ALTER TABLE theme_stocks ADD COLUMN notes TEXT");
  }

  // Telegram bot tables
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS telegram_users (
      telegram_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      alert_theme_movers INTEGER DEFAULT 1,
      alert_sector_rotation INTEGER DEFAULT 1,
      alert_threshold REAL DEFAULT 5.0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS telegram_pending (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}
