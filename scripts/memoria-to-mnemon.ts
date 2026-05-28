#!/usr/bin/env tsx
// @ts-nocheck
/**
 * memoria-to-mnemon.ts
 * Feeds Memoria entries from HQ Turso DB into mnemon.
 *
 * Usage (run from claudius-hq root where @libsql/client is installed):
 *   export TURSO_DATABASE_URL=...
 *   export TURSO_AUTH_TOKEN=...
 *   npx tsx ../tools/memoria-to-mnemon.ts [--dry-run] [--batch-size N] [--since YYYY-MM-DD]
 */

const { createClient } = require("@libsql/client");
const { spawn } = require("child_process");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = parseInt(
  process.argv.find((a, i, arr) => arr[i - 1] === "--batch-size" && a) || "50",
  10
);
const SINCE = process.argv.find((a, i, arr) => arr[i - 1] === "--since" && a);
const SOURCE_TYPE = process.argv.find((a, i, arr) => arr[i - 1] === "--source-type" && a);

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN env vars");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

/** Map source_type to mnemon category */
function toCategory(sourceType) {
  switch (sourceType) {
    case "book":
    case "article":
      return "fact";
    case "thought":
      return "insight";
    case "tweet":
      return "context";
    default:
      return "fact";
  }
}

/** Map source_type + favorite to mnemon importance (1-5) */
function toImportance(sourceType, isFavorite) {
  if (isFavorite) return 4;
  if (sourceType === "thought") return 3;
  if (sourceType === "book") return 3;
  return 2;
}

/** Build entity list from source metadata and tags */
function buildEntities(entry) {
  const entities = [`memoria-id:${entry.id}`];
  if (entry.sourceTitle) entities.push(entry.sourceTitle);
  if (entry.sourceAuthor) entities.push(entry.sourceAuthor);
  if (entry.sourceType) entities.push(entry.sourceType);
  if (entry.aiTags) {
    entry.aiTags
      .split(/,|;/)
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((t) => entities.push(t));
  }
  // Keep memoria-id, drop rest if overflowing 9 entries.
  return [entities[0], ...new Set(entities.slice(1))].slice(0, 9).join(",");
}

/** Build the fact text from content + optional note/summary */
function buildFact(entry) {
  let fact = entry.content.trim();
  if (entry.ai_summary) {
    fact = `[Summary] ${entry.ai_summary.trim()}\n\n${fact}`;
  }
  if (entry.my_note) {
    fact += `\n\n[Note] ${entry.my_note.trim()}`;
  }
  // mnemon caps facts at 8000 chars; truncate long ones (full text still lives in Turso/vault).
  if (fact.length > 7900) {
    fact = fact.slice(0, 7900) + "\n\n[truncated]";
  }
  return fact;
}

/** Run mnemon remember and return parsed JSON */
function mnemonRemember(fact, category, importance, entities) {
  return new Promise((resolve, reject) => {
    // Flags first, then "--", then the fact — so facts starting with "-"
    // (markdown bullet lists) aren't parsed as CLI flags.
    const args = [
      "remember",
      "--cat",
      category,
      "--imp",
      String(importance),
      "--entities",
      entities,
      "--source",
      "memoria-import",
      "--",
      fact,
    ];
    const child = spawn("mnemon", args, {
      env: process.env,
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`mnemon exited ${code}: ${stderr || stdout}`));
      }
      // Parse the JSON result to get action + the new insight id.
      try {
        const start = stdout.indexOf("{");
        const parsed = JSON.parse(stdout.slice(start));
        resolve({ action: parsed.action || "added", id: parsed.id || null });
      } catch {
        const skipped = /already exists|duplicate|merged with existing|skipped/i.test(stdout + stderr);
        resolve({ action: skipped ? "skipped" : "added", id: null });
      }
    });

    child.on("error", reject);
  });
}

/**
 * Upsert support: when an entry's content changes, mnemon adds a NEW insight and the
 * stale one lingers. After a successful "added", forget any other insights carrying the
 * same memoria-id:<id> entity (keeping the just-added one). Reads mnemon's local SQLite
 * directly to find them (read-only), then shells `mnemon forget`.
 */
const MNEMON_DB = process.env.MNEMON_DB || "/root/.mnemon/data/default/mnemon.db";
const mdb = createClient({ url: `file:${MNEMON_DB}` });

async function forgetStaleVersions(memoriaId, keepId) {
  const res = await mdb.execute({
    sql: `SELECT id FROM insights WHERE deleted_at IS NULL AND entities LIKE ?`,
    args: [`%"memoria-id:${memoriaId}"%`],
  });
  let forgotten = 0;
  for (const row of res.rows) {
    const iid = String(row.id);
    if (iid === keepId) continue;
    await new Promise((resolve) => {
      const c = spawn("mnemon", ["forget", iid], { env: process.env });
      c.on("close", () => resolve(null));
      c.on("error", () => resolve(null));
    });
    forgotten++;
  }
  return forgotten;
}

async function fetchBatch(offset) {
  let sql = `SELECT id, content, source_type, source_title, source_author,
                    my_note, ai_tags, ai_summary, is_favorite, is_archived,
                    captured_at, created_at
             FROM memoria_entries
             WHERE is_archived = 0`;
  const args = [];
  if (SINCE) {
    // updated_at (not created_at) so EDITS to existing entries re-sync, not just new ones.
    sql += ` AND updated_at >= ?`;
    args.push(SINCE);
  }
  if (SOURCE_TYPE) {
    sql += ` AND source_type = ?`;
    args.push(SOURCE_TYPE);
  }
  sql += ` ORDER BY id LIMIT ? OFFSET ?`;
  args.push(BATCH_SIZE, offset);

  const result = await db.execute({ sql, args });
  return result.rows;
}

async function main() {
  console.log(`[memoria→mnemon] DRY_RUN=${DRY_RUN} BATCH_SIZE=${BATCH_SIZE} SINCE=${SINCE || "all"}`);

  let offset = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let total = 0;

  while (true) {
    const rows = await fetchBatch(offset);
    if (rows.length === 0) break;

    for (const row of rows) {
      total++;
      const entry = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
          v,
        ])
      );

      const fact = buildFact(entry);
      const category = toCategory(entry.sourceType);
      const importance = toImportance(entry.sourceType, entry.isFavorite);
      const entities = buildEntities(entry);

      console.log(
        `[${total}] #${entry.id} ${entry.sourceType} | cat=${category} imp=${importance} entities=[${entities}]`
      );

      if (DRY_RUN) {
        console.log("  → DRY_RUN - would remember:", fact.slice(0, 120) + "...");
        continue;
      }

      try {
        const result = await mnemonRemember(fact, category, importance, entities);
        if (result.action === "skipped") {
          skipped++;
          console.log(`  → skipped (duplicate)`);
        } else {
          imported++;
          // Content changed → forget stale prior versions for this memoria-id.
          const purged = await forgetStaleVersions(entry.id, result.id);
          console.log(`  → ${result.action} id=${result.id || "?"}${purged ? ` (purged ${purged} stale)` : ""}`);
        }
      } catch (err) {
        failed++;
        console.error(`  → FAILED: ${err.message}`);
      }

      // Brief pause between calls to keep mnemon / SQLite happy
      await new Promise((r) => setTimeout(r, 100));
    }

    offset += BATCH_SIZE;
  }

  console.log(`\nDone. Total=${total} Imported=${imported} Skipped=${skipped} Failed=${failed}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
