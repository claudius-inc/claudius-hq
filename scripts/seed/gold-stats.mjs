import { createClient } from "@libsql/client";
import { config } from "dotenv";

config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  const today = new Date().toISOString().split('T')[0];
  
  // Seed with WGC data from Mr Z's analysis:
  // - Central Bank Buying 2025: 863 tonnes
  // - Global ETF Flows Jan 2026: $19 billion (record)
  await client.execute({
    sql: `INSERT OR REPLACE INTO gold_flows (date, central_bank_tonnes, global_etf_flow_usd, source)
          VALUES (?, ?, ?, ?)`,
    args: [today, 863, 19000000000, 'wgc-manual']
  });
  
  console.log("Seeded gold flow data with central bank (863t) and global ETF ($19B)");
}

main().catch(console.error);
