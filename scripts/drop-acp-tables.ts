import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const tablesToDrop = [
  "acp_activities",
  "acp_wallet_snapshots", 
  "acp_epoch_stats",
  "acp_offering_experiments",
  "acp_offering_metrics",
  "acp_price_experiments",
  "acp_competitors",
  "acp_competitor_snapshots",
  "acp_state",
  "acp_strategy",
  "acp_tasks",
  "acp_decisions",
  "acp_marketing",
  "acp_jobs",
];

async function main() {
  for (const table of tablesToDrop) {
    try {
      await client.execute(`DROP TABLE IF EXISTS ${table}`);
      console.log(`✓ Dropped ${table}`);
    } catch (err) {
      console.error(`✗ Failed to drop ${table}:`, err);
    }
  }
  
  // Verify acp_offerings still exists
  const result = await client.execute("SELECT COUNT(*) as count FROM acp_offerings");
  console.log(`\n✓ acp_offerings preserved (${result.rows[0].count} rows)`);
}

main().catch(console.error);
