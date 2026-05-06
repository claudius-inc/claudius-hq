/**
 * Backfill qualitative profiles for every ticker in scanner_universe whose
 * `profile_generated_at` is NULL. Calls Gemini once per ticker, throttled
 * sequentially with a small jitter to stay well under any quota.
 *
 * Usage:
 *   npx tsx scripts/backfill-ticker-profiles.ts                 # dry run, all rows
 *   npx tsx scripts/backfill-ticker-profiles.ts --commit        # actually write
 *   npx tsx scripts/backfill-ticker-profiles.ts --commit --limit 10
 *   npx tsx scripts/backfill-ticker-profiles.ts --ticker NVDA --commit
 *
 * Notes:
 * - Profile-only — does NOT touch tags / themes / description / notes. The
 *   tag+theme classification was already produced when the ticker was first
 *   added; redoing it here would risk shifting an established taxonomy.
 * - Skips rows that already have profile_generated_at set, even if some
 *   fields are empty. Use --force to override.
 * - Sequential throttle: 1500ms between calls. Backfilling ~150 tickers
 *   takes ~4 minutes; perfectly fine to leave running.
 */
import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, isNull, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import {
  generateTickerAiResult,
  profileToColumns,
} from "../src/lib/ticker-ai";

dotenv.config({ path: ".env.local" });
dotenv.config();

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const FORCE = args.includes("--force");
const LIMIT_IDX = args.indexOf("--limit");
const LIMIT =
  LIMIT_IDX >= 0 && args[LIMIT_IDX + 1] ? parseInt(args[LIMIT_IDX + 1], 10) : null;
const TICKER_IDX = args.indexOf("--ticker");
const SINGLE_TICKER =
  TICKER_IDX >= 0 && args[TICKER_IDX + 1]
    ? args[TICKER_IDX + 1].toUpperCase()
    : null;

const SLEEP_MS = 1500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not set; aborting.");
    process.exit(1);
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client, { schema });

  // Pick the universe rows to process.
  let rows: {
    ticker: string;
    market: string;
    name: string | null;
    sector: string | null;
    profileGeneratedAt: string | null;
  }[];

  if (SINGLE_TICKER) {
    rows = await db
      .select({
        ticker: schema.scannerUniverse.ticker,
        market: schema.scannerUniverse.market,
        name: schema.scannerUniverse.name,
        sector: schema.scannerUniverse.sector,
        profileGeneratedAt: schema.scannerUniverse.profileGeneratedAt,
      })
      .from(schema.scannerUniverse)
      .where(eq(schema.scannerUniverse.ticker, SINGLE_TICKER));
  } else if (FORCE) {
    rows = await db
      .select({
        ticker: schema.scannerUniverse.ticker,
        market: schema.scannerUniverse.market,
        name: schema.scannerUniverse.name,
        sector: schema.scannerUniverse.sector,
        profileGeneratedAt: schema.scannerUniverse.profileGeneratedAt,
      })
      .from(schema.scannerUniverse);
  } else {
    rows = await db
      .select({
        ticker: schema.scannerUniverse.ticker,
        market: schema.scannerUniverse.market,
        name: schema.scannerUniverse.name,
        sector: schema.scannerUniverse.sector,
        profileGeneratedAt: schema.scannerUniverse.profileGeneratedAt,
      })
      .from(schema.scannerUniverse)
      .where(isNull(schema.scannerUniverse.profileGeneratedAt));
  }

  if (LIMIT != null && Number.isFinite(LIMIT)) {
    rows = rows.slice(0, LIMIT);
  }

  console.log(
    `Found ${rows.length} ticker(s) to ${COMMIT ? "process" : "preview"}${FORCE ? " (--force, including rows with existing profiles)" : ""}`,
  );
  if (rows.length === 0) {
    process.exit(0);
  }
  if (!COMMIT) {
    console.log("\nDry run — no DB writes. Tickers that would be drafted:");
    for (const r of rows) {
      const stamp = r.profileGeneratedAt ? `(redraft ${r.profileGeneratedAt})` : "(new)";
      console.log(`  ${r.ticker.padEnd(10)} ${stamp}  ${r.name ?? ""}`);
    }
    console.log("\nRe-run with --commit to actually write.");
    process.exit(0);
  }

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const prefix = `[${i + 1}/${rows.length}] ${r.ticker.padEnd(10)}`;
    try {
      const result = await generateTickerAiResult({
        ticker: r.ticker,
        name: r.name,
        sector: r.sector,
        market: r.market,
      });
      const cols = profileToColumns(result.profile);
      await db
        .update(schema.scannerUniverse)
        .set({
          ...cols,
          profileGeneratedAt: sql`datetime('now')`,
          updatedAt: sql`datetime('now')`,
        })
        .where(eq(schema.scannerUniverse.ticker, r.ticker));

      const segs = result.profile.revenueSegments?.length ?? 0;
      const tw = result.profile.tailwinds?.length ?? 0;
      const hw = result.profile.headwinds?.length ?? 0;
      console.log(
        `${prefix} OK  segs=${segs} tw=${tw} hw=${hw}  ${result.profile.cyclicality?.slice(0, 60) ?? "—"}`,
      );
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${prefix} ERR  ${msg.slice(0, 200)}`);
      failed++;
    }

    // Throttle between calls. Skip on the very last one.
    if (i < rows.length - 1) {
      await sleep(SLEEP_MS);
    }
  }

  console.log(`\nDone. ok=${ok} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
