import { createClient } from "@libsql/client";
import { writeFileSync } from "fs";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function dump() {
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' AND name NOT LIKE 'libsql_%'");
  
  let sql = "-- HQ Database Dump\n-- Generated: " + new Date().toISOString() + "\n\n";
  
  for (const row of tables.rows) {
    const tableName = row.name;
    const schema = await client.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
    if (schema.rows[0]?.sql) {
      sql += schema.rows[0].sql + ";\n\n";
    }
    
    const data = await client.execute(`SELECT * FROM "${tableName}"`);
    if (data.rows.length > 0) {
      for (const dataRow of data.rows) {
        const values = Object.values(dataRow).map(v => 
          v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
        ).join(', ');
        sql += `INSERT INTO "${tableName}" VALUES (${values});\n`;
      }
      sql += "\n";
    }
  }
  
  const outPath = process.argv[2] || "/root/.openclaw/workspace/backups/hq-" + new Date().toISOString().slice(0,10).replace(/-/g,'') + ".sql";
  writeFileSync(outPath, sql);
  console.log("Dumped to:", outPath);
  console.log("Tables:", tables.rows.map(r => r.name).join(", "));
}

dump().catch(console.error);
