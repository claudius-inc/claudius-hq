import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  // Check if description column already exists
  const cols = await db.execute("PRAGMA table_info(watchlist_scores)");
  const hasDescription = cols.rows.some((c: any) => c.name === "description");

  if (hasDescription) {
    console.log("Column 'description' already exists in watchlist_scores.");
    return;
  }

  // Add description column
  await db.execute("ALTER TABLE watchlist_scores ADD COLUMN description TEXT");
  console.log("Added 'description' column to watchlist_scores.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
