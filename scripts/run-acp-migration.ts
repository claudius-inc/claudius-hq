/**
 * Run ACP Operations migration directly against Turso
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const migrations = [
  // Core state table (single row, updated frequently)
  `CREATE TABLE IF NOT EXISTS acp_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    current_pillar TEXT NOT NULL DEFAULT 'quality',
    current_epoch INTEGER,
    epoch_start TEXT,
    epoch_end TEXT,
    jobs_this_epoch INTEGER DEFAULT 0,
    revenue_this_epoch REAL DEFAULT 0,
    target_jobs INTEGER,
    target_revenue REAL,
    target_rank INTEGER,
    server_running INTEGER DEFAULT 1,
    server_pid INTEGER,
    last_heartbeat TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  // Ensure only one row exists
  `INSERT OR IGNORE INTO acp_state (id, current_pillar) VALUES (1, 'quality')`,

  // Strategy parameters (key-value store)
  `CREATE TABLE IF NOT EXISTS acp_strategy (
    id TEXT PRIMARY KEY,
    category TEXT,
    key TEXT NOT NULL,
    value TEXT,
    notes TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`,

  // Task queue
  `CREATE TABLE IF NOT EXISTS acp_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pillar TEXT NOT NULL,
    priority INTEGER DEFAULT 50,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    assigned_at TEXT,
    completed_at TEXT,
    result TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // Indexes for tasks
  `CREATE INDEX IF NOT EXISTS idx_acp_tasks_status ON acp_tasks(status)`,
  `CREATE INDEX IF NOT EXISTS idx_acp_tasks_pillar ON acp_tasks(pillar)`,
  `CREATE INDEX IF NOT EXISTS idx_acp_tasks_priority ON acp_tasks(priority DESC)`,

  // Decision log
  `CREATE TABLE IF NOT EXISTS acp_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_type TEXT,
    offering TEXT,
    old_value TEXT,
    new_value TEXT,
    reasoning TEXT,
    outcome TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // Index for decisions
  `CREATE INDEX IF NOT EXISTS idx_acp_decisions_created ON acp_decisions(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_acp_decisions_type ON acp_decisions(decision_type)`,

  // Marketing campaigns
  `CREATE TABLE IF NOT EXISTS acp_marketing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT,
    content TEXT NOT NULL,
    target_offering TEXT,
    status TEXT DEFAULT 'draft',
    scheduled_at TEXT,
    posted_at TEXT,
    tweet_id TEXT,
    engagement_likes INTEGER DEFAULT 0,
    engagement_retweets INTEGER DEFAULT 0,
    engagement_replies INTEGER DEFAULT 0,
    jobs_attributed INTEGER DEFAULT 0,
    revenue_attributed REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,

  // Indexes for marketing
  `CREATE INDEX IF NOT EXISTS idx_acp_marketing_status ON acp_marketing(status)`,
  `CREATE INDEX IF NOT EXISTS idx_acp_marketing_channel ON acp_marketing(channel)`,
];

async function runMigration() {
  console.log("Running ACP Operations migration...\n");

  for (const sql of migrations) {
    try {
      const firstLine = sql.trim().split("\n")[0].substring(0, 60);
      console.log(`Running: ${firstLine}...`);
      await client.execute(sql);
      console.log("  ✓ Success\n");
    } catch (error) {
      const err = error as Error;
      // Skip "already exists" errors for indexes
      if (err.message?.includes("already exists")) {
        console.log("  ⚠ Already exists, skipping\n");
      } else {
        console.error(`  ✗ Error: ${err.message}\n`);
        throw error;
      }
    }
  }

  console.log("\n✅ Migration complete!");

  // Verify tables were created
  console.log("\nVerifying tables...");
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'acp_%' ORDER BY name"
  );
  console.log("ACP tables:", tables.rows.map((r) => r.name).join(", "));
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
