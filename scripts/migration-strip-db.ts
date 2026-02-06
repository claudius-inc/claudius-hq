/**
 * Migration Script: Strip Database
 * 
 * Drops unused tables and keeps only: projects, ideas, stock_reports
 * 
 * Run: npx tsx scripts/migration-strip-db.ts
 */

import "dotenv/config";
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const TABLES_TO_DROP = [
  "crons",
  "tasks", 
  "research_notes",
  "wiki_pages",
  "emails",
  "metrics",
  "activity",
  "comments",
  "phase_checklists",
  "project_checklist_progress",
  "health_checks",
  "watchlist_stocks",
  "stock_prices",
  "stock_news",
];

async function migrate() {
  console.log("🗑️  Dropping unused tables...\n");
  
  for (const table of TABLES_TO_DROP) {
    try {
      await db.execute(`DROP TABLE IF EXISTS ${table}`);
      console.log(`  ✅ Dropped: ${table}`);
    } catch (error) {
      console.log(`  ⚠️  Failed to drop ${table}: ${error}`);
    }
  }

  console.log("\n📊 Verifying remaining tables...\n");
  
  // Verify the tables we want to keep
  const keepTables = ["projects", "ideas", "stock_reports"];
  for (const table of keepTables) {
    try {
      const result = await db.execute(`SELECT COUNT(*) as count FROM ${table}`);
      const count = (result.rows[0] as unknown as { count: number }).count;
      console.log(`  ✅ ${table}: ${count} rows`);
    } catch (error) {
      console.log(`  ⚠️  ${table}: not found or error - ${error}`);
    }
  }

  console.log("\n✅ Migration complete!");
}

migrate().catch(console.error);
