/**
 * Post-migration verification — read-only sanity checks against the live DB.
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  const checks: { name: string; query: string }[] = [
    { name: "ticker_metrics row count", query: "SELECT COUNT(*) AS n FROM ticker_metrics" },
    { name: "scanner_universe row count", query: "SELECT COUNT(*) AS n FROM scanner_universe" },
    { name: "themes row count", query: "SELECT COUNT(*) AS n FROM themes" },
    { name: "tags row count", query: "SELECT COUNT(*) AS n FROM tags" },
    { name: "ticker_tags row count", query: "SELECT COUNT(*) AS n FROM ticker_tags" },
    { name: "theme_tags row count", query: "SELECT COUNT(*) AS n FROM theme_tags" },
    {
      name: "tickers in metrics WITH a registry row",
      query: `
        SELECT COUNT(*) AS n FROM ticker_metrics tm
        JOIN scanner_universe su ON su.ticker = tm.ticker
      `,
    },
    {
      name: "tickers in metrics WITHOUT a registry row (orphans)",
      query: `
        SELECT COUNT(*) AS n FROM ticker_metrics tm
        LEFT JOIN scanner_universe su ON su.ticker = tm.ticker
        WHERE su.ticker IS NULL
      `,
    },
    {
      name: "scanner_universe rows with notes",
      query: `SELECT COUNT(*) AS n FROM scanner_universe WHERE notes IS NOT NULL AND TRIM(notes) != ''`,
    },
    {
      name: "top 10 tags by usage",
      query: `
        SELECT t.name AS name,
          (SELECT COUNT(*) FROM ticker_tags tt WHERE tt.tag_id = t.id) +
          (SELECT COUNT(*) FROM theme_tags th WHERE th.tag_id = t.id) AS count
        FROM tags t
        ORDER BY count DESC, name ASC
        LIMIT 10
      `,
    },
  ];

  for (const c of checks) {
    console.log(`\n--- ${c.name} ---`);
    const r = await db.execute(c.query);
    for (const row of r.rows) console.log(row);
  }

  // Confirm legacy tables / columns are gone.
  console.log(`\n--- legacy storage gone? ---`);
  for (const t of ["stock_tags", "watchlist_scores"]) {
    const r = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      args: [t],
    });
    console.log(`  ${t}: ${r.rows.length === 0 ? "GONE ✓" : "still present ✗"}`);
  }
  const themesCols = await db.execute("PRAGMA table_info(themes)");
  const hasTagsCol = themesCols.rows.some((r: { name: unknown }) => r.name === "tags");
  console.log(`  themes.tags column: ${hasTagsCol ? "still present ✗" : "GONE ✓"}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
