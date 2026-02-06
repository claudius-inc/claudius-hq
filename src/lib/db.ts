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
      phase TEXT DEFAULT 'build' CHECK(phase IN ('idea','research','build','launch','grow','iterate','maintain')),
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
  `);

  // Add phase column to existing projects table if missing
  try {
    await db.execute("SELECT phase FROM projects LIMIT 1");
  } catch {
    await db.execute("ALTER TABLE projects ADD COLUMN phase TEXT DEFAULT 'build' CHECK(phase IN ('idea','research','build','launch','grow','iterate','maintain'))");
  }
}
