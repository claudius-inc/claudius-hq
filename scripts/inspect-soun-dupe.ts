import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  const r = await db.execute(
    "SELECT * FROM theme_stocks WHERE theme_id = 60 AND ticker = 'SOUN' ORDER BY id",
  );
  for (const row of r.rows) console.log(row);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
