/**
 * Read all tmp/results/batch-*.json files (produced by the parallel sub-agent
 * backfill) and apply them to scanner_universe.
 *
 * Each file is an array of `{ ticker, profile }` objects; profile has the
 * shape of TickerProfile from src/lib/ticker-ai.
 *
 * Usage:
 *   npx tsx scripts/ingest-backfill-results.ts            # dry run
 *   npx tsx scripts/ingest-backfill-results.ts --commit
 */
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });
dotenv.config({ quiet: true });

// Lazy require so dotenv runs first — src/db/index.ts initializes the libsql
// client at module-load time and would crash on undefined TURSO_DATABASE_URL.
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

interface TickerProfile {
  revenueModel: string | null;
  revenueSegments: { item: string; pct: number }[] | null;
  cyclicality: string | null;
  tailwinds: string[] | null;
  headwinds: string[] | null;
  threats: string[] | null;
  opportunities: string[] | null;
  customerConcentration: string | null;
}

// Inlined from src/lib/ticker-ai to avoid the @/db import chain at startup.
function profileToColumns(profile: TickerProfile): {
  revenueModel: string | null;
  revenueSegments: string | null;
  cyclicality: string | null;
  tailwinds: string | null;
  headwinds: string | null;
  threats: string | null;
  opportunities: string | null;
  customerConcentration: string | null;
} {
  return {
    revenueModel: profile.revenueModel,
    revenueSegments:
      profile.revenueSegments && profile.revenueSegments.length > 0
        ? JSON.stringify(profile.revenueSegments)
        : null,
    cyclicality: profile.cyclicality,
    tailwinds:
      profile.tailwinds && profile.tailwinds.length > 0
        ? JSON.stringify(profile.tailwinds)
        : null,
    headwinds:
      profile.headwinds && profile.headwinds.length > 0
        ? JSON.stringify(profile.headwinds)
        : null,
    threats:
      profile.threats && profile.threats.length > 0
        ? JSON.stringify(profile.threats)
        : null,
    opportunities:
      profile.opportunities && profile.opportunities.length > 0
        ? JSON.stringify(profile.opportunities)
        : null,
    customerConcentration: profile.customerConcentration,
  };
}

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");

interface ResultRow {
  ticker: string;
  profile: TickerProfile;
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = asString(item);
    if (s) out.push(s);
  }
  return out.length > 0 ? out : null;
}

function asSegments(v: unknown): { item: string; pct: number }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { item: string; pct: number }[] = [];
  for (const seg of v) {
    if (!seg || typeof seg !== "object") continue;
    const s = seg as { item?: unknown; pct?: unknown };
    const item = asString(s.item);
    const pct = typeof s.pct === "number" ? s.pct : Number(s.pct);
    if (item && Number.isFinite(pct)) {
      out.push({ item, pct: Math.max(0, Math.min(100, pct)) });
    }
  }
  return out.length > 0 ? out : null;
}

function normalizeProfile(raw: unknown): TickerProfile {
  if (!raw || typeof raw !== "object") {
    return {
      revenueModel: null,
      revenueSegments: null,
      cyclicality: null,
      tailwinds: null,
      headwinds: null,
      threats: null,
      opportunities: null,
      customerConcentration: null,
    };
  }
  const r = raw as Record<string, unknown>;
  return {
    revenueModel: asString(r.revenueModel),
    revenueSegments: asSegments(r.revenueSegments),
    cyclicality: asString(r.cyclicality),
    tailwinds: asStringArray(r.tailwinds),
    headwinds: asStringArray(r.headwinds),
    threats: asStringArray(r.threats),
    opportunities: asStringArray(r.opportunities),
    customerConcentration: asString(r.customerConcentration),
  };
}

async function main() {
  const dir = path.join("tmp", "results");
  if (!fs.existsSync(dir)) {
    console.error(`No ${dir} directory; nothing to ingest.`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("batch-") && f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.error(`No batch-*.json files in ${dir}`);
    process.exit(1);
  }

  const all: ResultRow[] = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error(`  ${f}: PARSE ERROR — ${(e as Error).message}`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      console.error(`  ${f}: not an array, skipping`);
      continue;
    }
    let kept = 0;
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const r = item as { ticker?: unknown; profile?: unknown };
      const ticker = asString(r.ticker);
      if (!ticker) continue;
      all.push({
        ticker: ticker.toUpperCase(),
        profile: normalizeProfile(r.profile),
      });
      kept++;
    }
    console.log(`  ${f}: ${kept} rows`);
  }

  console.log(`\nTotal rows to ingest: ${all.length}`);
  if (!COMMIT) {
    console.log("Dry run — re-run with --commit to write.");
    process.exit(0);
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client, { schema });

  let ok = 0;
  let skipped = 0;
  for (const row of all) {
    const cols = profileToColumns(row.profile);
    // Skip rows where the profile is entirely empty — leave
    // profile_generated_at NULL so backfill can retry.
    const isEmpty =
      !cols.revenueModel &&
      !cols.cyclicality &&
      !cols.customerConcentration &&
      !cols.revenueSegments &&
      !cols.tailwinds &&
      !cols.headwinds &&
      !cols.threats &&
      !cols.opportunities;
    if (isEmpty) {
      skipped++;
      continue;
    }
    const result = await db
      .update(schema.scannerUniverse)
      .set({
        ...cols,
        profileGeneratedAt: sql`datetime('now')`,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.scannerUniverse.ticker, row.ticker))
      .returning({ ticker: schema.scannerUniverse.ticker });
    if (result.length > 0) ok++;
  }

  console.log(`\nWrote ${ok} rows, skipped ${skipped} empty.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
