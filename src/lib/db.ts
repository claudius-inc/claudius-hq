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

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog','in_progress','blocked','done')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
      category TEXT DEFAULT '',
      blocker_reason TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL CHECK(target_type IN ('task','activity','project')),
      target_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      author TEXT DEFAULT 'Mr Z',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      schedule TEXT NOT NULL,
      description TEXT DEFAULT '',
      last_run TEXT DEFAULT '',
      next_run TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','error','running')),
      last_error TEXT DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_project ON metrics(project_id, metric_name, recorded_at);

    CREATE TABLE IF NOT EXISTS phase_checklists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phase TEXT NOT NULL,
      item_order INTEGER DEFAULT 0,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_template INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS project_checklist_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      checklist_item_id INTEGER NOT NULL REFERENCES phase_checklists(id),
      completed INTEGER DEFAULT 0,
      completed_at TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_progress ON project_checklist_progress(project_id, checklist_item_id);

    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_address TEXT NOT NULL DEFAULT '',
      to_address TEXT NOT NULL DEFAULT '',
      subject TEXT DEFAULT '',
      body_text TEXT DEFAULT '',
      body_html TEXT DEFAULT '',
      headers TEXT DEFAULT '{}',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS research_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id INTEGER REFERENCES ideas(id),
      project_id INTEGER REFERENCES projects(id),
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      note_type TEXT DEFAULT 'general' CHECK(note_type IN ('general','competitor','market','tech','user_feedback')),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Add phase column to existing projects table if missing
  try {
    await db.execute("SELECT phase FROM projects LIMIT 1");
  } catch {
    await db.execute("ALTER TABLE projects ADD COLUMN phase TEXT DEFAULT 'build' CHECK(phase IN ('idea','research','build','launch','grow','iterate','maintain'))");
  }

  // Seed phase checklist templates
  await seedChecklistTemplates();
}

async function seedChecklistTemplates() {
  const existing = await db.execute("SELECT COUNT(*) as count FROM phase_checklists WHERE is_template = 1");
  const count = (existing.rows[0] as unknown as { count: number }).count;
  if (count > 0) return; // Already seeded

  const templates: { phase: string; items: string[] }[] = [
    {
      phase: "launch",
      items: [
        "Set up analytics/monitoring",
        "Post to Reddit (relevant subreddits)",
        "Post to Hacker News (Show HN)",
        "Submit to Product Hunt",
        "Monitor for first 48h errors",
        "Respond to all launch day feedback",
      ],
    },
    {
      phase: "grow",
      items: [
        "Check analytics weekly (users, traffic, signups)",
        "Write 1 blog/content piece per week",
        "Engage in relevant communities",
        "Set up SEO monitoring",
        "Track competitor moves",
        "Collect user feedback",
      ],
    },
    {
      phase: "iterate",
      items: [
        "Review user feedback backlog",
        "Prioritize top 3 feature requests",
        "Fix reported bugs within 48h",
        "A/B test key flows",
        "Update documentation",
      ],
    },
    {
      phase: "maintain",
      items: [
        "Weekly dependency updates check",
        "Monitor uptime and error rates",
        "Respond to support requests",
        "Quarterly security review",
      ],
    },
  ];

  for (const template of templates) {
    for (let i = 0; i < template.items.length; i++) {
      await db.execute({
        sql: "INSERT INTO phase_checklists (phase, item_order, title, is_template) VALUES (?, ?, ?, 1)",
        args: [template.phase, i, template.items[i]],
      });
    }
  }
}
