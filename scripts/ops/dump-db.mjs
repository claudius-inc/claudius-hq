import { createClient } from "@libsql/client";
import { writeFileSync } from "fs";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Exclude large regeneratable tables
const EXCLUDE = ['stock_prices_daily', 'gavekal_prices', 'gavekal_historical_snapshot', 'market_cache', 'scanner_universe', 'sqlite_sequence'];

async function dumpTable(client, tableName) {
  let sql = '';
  const schema = await client.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
  if (schema.rows[0]?.sql) {
    sql += schema.rows[0].sql + ";\n";
  }
  
  // Get row count first
  const count = await client.execute(`SELECT count(*) as c FROM "${tableName}"`);
  const total = count.rows[0].c;
  if (total === 0) return sql;
  
  // Fetch in batches of 500
  const BATCH = 500;
  let offset = 0;
  while (offset < total) {
    const data = await client.execute(`SELECT * FROM "${tableName}" LIMIT ${BATCH} OFFSET ${offset}`);
    for (const row of data.rows) {
      const values = Object.values(row).map(v =>
        v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
      ).join(', ');
      sql += `INSERT INTO "${tableName}" VALUES (${values});\n`;
    }
    offset += BATCH;
    if (offset % 1000 === 0) process.stdout.write(`  ${tableName}: ${offset}/${total}\r`);
  }
  console.log(`  ${tableName}: ${total} rows`);
  return sql;
}

async function dump() {
  const allTables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' AND name NOT LIKE 'libsql_%'");
  const tables = allTables.rows.filter(r => !EXCLUDE.includes(r.name));
  
  console.log(`Dumping ${tables.length} tables (excluding: ${EXCLUDE.join(', ')})`);
  
  let sql = "-- HQ Database Dump\n-- Generated: " + new Date().toISOString() + "\n-- Excluded tables: " + EXCLUDE.join(", ") + "\n\n";
  
  for (const row of tables) {
    try {
      sql += await dumpTable(client, row.name) + "\n";
      // Small delay to avoid Turso rate limits
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.error(`  ERROR on ${row.name}: ${e.message}`);
      sql += `-- ERROR: Failed to dump ${row.name}: ${e.message}\n\n`;
    }
  }
  
  const outPath = process.argv[2] || "/root/.openclaw/workspace/backups/hq-" + new Date().toISOString().slice(0,10).replace(/-/g,'') + ".sql";
  writeFileSync(outPath, sql);
  console.log(`\nDumped to: ${outPath} (${(Buffer.byteLength(sql)/1024).toFixed(0)} KB)`);
}

dump().catch(console.error);
