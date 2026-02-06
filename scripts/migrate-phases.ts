import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  console.log("Migrating phases to build/live only...");

  // Disable foreign keys temporarily
  await db.execute("PRAGMA foreign_keys = OFF");

  // SQLite doesn't support altering CHECK constraints, so we need to recreate the table
  await db.executeMultiple(`
    -- Drop if exists from previous failed attempt
    DROP TABLE IF EXISTS projects_new;

    -- Create new table with updated constraint
    CREATE TABLE projects_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog','in_progress','blocked','done')),
      phase TEXT DEFAULT 'build' CHECK(phase IN ('build','live')),
      repo_url TEXT DEFAULT '',
      deploy_url TEXT DEFAULT '',
      test_count INTEGER DEFAULT 0,
      build_status TEXT DEFAULT 'unknown' CHECK(build_status IN ('pass','fail','unknown')),
      last_deploy_time TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Copy data, converting old phases to new ones
    INSERT INTO projects_new (id, name, description, status, phase, repo_url, deploy_url, test_count, build_status, last_deploy_time, created_at, updated_at)
    SELECT 
      id, name, description, status,
      CASE 
        WHEN phase IN ('launch', 'grow', 'iterate', 'maintain') THEN 'live'
        ELSE 'build'
      END as phase,
      repo_url, deploy_url, test_count, build_status, last_deploy_time, created_at, updated_at
    FROM projects;

    -- Drop old table
    DROP TABLE projects;

    -- Rename new table
    ALTER TABLE projects_new RENAME TO projects;
  `);

  // Re-enable foreign keys
  await db.execute("PRAGMA foreign_keys = ON");

  console.log("Migration complete!");
  
  // Verify
  const result = await db.execute("SELECT id, name, phase FROM projects");
  console.log("Current projects:");
  for (const row of result.rows) {
    console.log(`  ${row.id}: ${row.name} - ${row.phase}`);
  }
}

main().catch(console.error);
