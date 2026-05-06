/**
 * Reproduce the exact query the EditTickerProfileModal triggers via
 * GET /api/tickers/GEV — `select theme_id from theme_stocks where ticker = ?`
 * — to surface the underlying libsql error (the API route swallows the cause).
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ quiet: true });

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client, { schema });

  const ticker = "GEV";

  console.log("→ select universe");
  const u = await db
    .select()
    .from(schema.scannerUniverse)
    .where(eq(schema.scannerUniverse.ticker, ticker))
    .limit(1);
  console.log("  rows:", u.length, "keys:", u[0] ? Object.keys(u[0]).slice(0, 6) : []);

  console.log("→ select theme_stocks (the one in the error)");
  try {
    const t = await db
      .select({ themeId: schema.themeStocks.themeId })
      .from(schema.themeStocks)
      .where(eq(schema.themeStocks.ticker, ticker));
    console.log("  rows:", t.length, t);
  } catch (e) {
    console.error("  THREW:");
    console.error("  message:", e instanceof Error ? e.message : String(e));
    console.error("  cause:  ", (e as { cause?: unknown }).cause);
    console.error("  code:   ", (e as { code?: unknown }).code);
    console.error("  fullObj:", e);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Top-level:", err);
  process.exit(1);
});
