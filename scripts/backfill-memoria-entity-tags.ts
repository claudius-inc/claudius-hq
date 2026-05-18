#!/usr/bin/env npx tsx
/**
 * One-shot: tag existing mnemon insights (source=memoria-import) with `memoria-id:N`
 * by matching content against memoria entries from Turso.
 *
 * Run from claudius-hq root:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-memoria-entity-tags.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import { execFileSync } from "child_process";

const DRY_RUN = process.argv.includes("--dry-run");
const MNEMON_DB = process.env.MNEMON_DB || "/root/.mnemon/data/default/mnemon.db";

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

function buildFact(entry: any): string {
  let fact = String(entry.content).trim();
  if (entry.ai_summary) fact = `[Summary] ${String(entry.ai_summary).trim()}\n\n${fact}`;
  if (entry.my_note) fact += `\n\n[Note] ${String(entry.my_note).trim()}`;
  return fact;
}

function sqlLit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function sqliteRun(sql: string): string {
  return execFileSync("sqlite3", [MNEMON_DB], { input: sql, encoding: "utf8" });
}

function findInsight(content: string): { id: string; entities: string } | null {
  const sql = `SELECT json_object('id', id, 'entities', COALESCE(entities, '[]')) FROM insights WHERE source='memoria-import' AND content = ${sqlLit(content)} LIMIT 1;\n`;
  const out = sqliteRun(sql).trim();
  return out ? JSON.parse(out) : null;
}

function updateEntities(id: string, entitiesJson: string) {
  sqliteRun(
    `UPDATE insights SET entities = ${sqlLit(entitiesJson)}, updated_at = datetime('now') WHERE id = ${sqlLit(id)};\n`
  );
}

async function main() {
  const entries = (
    await turso.execute(
      `SELECT id, content, my_note, ai_summary FROM memoria_entries WHERE is_archived = 0`
    )
  ).rows;

  let matched = 0, tagged = 0, alreadyTagged = 0, unmatched = 0;

  for (const e of entries) {
    const fact = buildFact(e);
    const hit = findInsight(fact);
    if (!hit) { unmatched++; continue; }
    matched++;
    const tag = `memoria-id:${e.id}`;
    let entities: string[] = [];
    try { entities = JSON.parse(hit.entities || "[]"); } catch {}
    if (entities.includes(tag)) { alreadyTagged++; continue; }
    entities.unshift(tag);
    if (!DRY_RUN) updateEntities(hit.id, JSON.stringify(entities));
    tagged++;
  }

  console.log(
    `entries=${entries.length} matched=${matched} tagged=${tagged} alreadyTagged=${alreadyTagged} unmatched=${unmatched}`
  );
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
