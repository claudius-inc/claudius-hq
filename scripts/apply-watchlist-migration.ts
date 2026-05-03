import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  const raw = fs.readFileSync("drizzle/0007_add_watchlist_scores.sql", "utf8");
  // Strip line comments, then split on semicolons.
  const sql = raw.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  const statements = sql.split(/;\s*$/m).map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    if (!stmt) continue;
    process.stdout.write(`Running: ${stmt.split("\n")[0].slice(0, 70)}... `);
    try {
      await client.execute(stmt);
      console.log("OK");
    } catch (err: any) {
      console.log(`ERR: ${err.message}`);
    }
  }
  // Verify table exists
  const r = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='watchlist_scores'");
  console.log("Table exists:", r.rows.length > 0);
  const cols = await client.execute("PRAGMA table_info(watchlist_scores)");
  console.log(`Columns (${cols.rows.length}):`, cols.rows.map((r: any) => r.name).join(", "));
}

run().catch(e => { console.error(e); process.exit(1); });
