import { createClient } from "@libsql/client";
import * as fs from "fs";

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const sql = fs.readFileSync(
    "./drizzle/0015_add_memoria_wiki_and_mnemon_snapshots.sql",
    "utf8",
  );
  await client.executeMultiple(sql);
  console.log("Migration applied successfully");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
