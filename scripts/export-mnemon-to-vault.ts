#!/usr/bin/env tsx
// @ts-nocheck
/**
 * export-mnemon-to-vault.ts
 * Read-only mirror of the mnemon knowledge graph into vault/Mnemon/*.md.
 * insights → notes, edges → [[wikilinks]]. Wipes Mnemon/ and regenerates.
 *
 * Usage:
 *   npx tsx scripts/export-mnemon-to-vault.ts [--vault DIR] [--db PATH] [--dry-run]
 */
const { createClient } = require("@libsql/client");
const fs = require("fs");
const path = require("path");
const {
  insightFilename, insightTitle, insightToMarkdown,
} = require("../src/lib/memoria/mnemon-vault.ts");

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const vaultArg = argv.indexOf("--vault");
const dbArg = argv.indexOf("--db");
const VAULT = path.resolve(vaultArg >= 0 ? argv[vaultArg + 1] : "/root/memoria-vault");
const DB_PATH = dbArg >= 0 ? argv[dbArg + 1] : "/root/.mnemon/data/default/mnemon.db";
const MNEMON_DIR = path.join(VAULT, "Mnemon");
const ENTRIES_DIR = path.join(VAULT, "Entries");

const db = createClient({ url: `file:${DB_PATH}` });

function parseJsonArray(s) {
  try { const v = JSON.parse(s || "[]"); return Array.isArray(v) ? v.map(String) : []; }
  catch { return []; }
}

function buildEntryTitleMap() {
  const map = new Map();
  if (!fs.existsSync(ENTRIES_DIR)) return map;
  for (const f of fs.readdirSync(ENTRIES_DIR)) {
    const m = f.match(/^(\d+)-(.+)\.md$/);
    if (m) map.set(Number(m[1]), f.replace(/\.md$/, ""));
  }
  return map;
}

async function main() {
  console.log(`[mnemon→vault] DB=${DB_PATH} OUT=${MNEMON_DIR} DRY_RUN=${DRY_RUN}`);

  const insRes = await db.execute(`
    SELECT id, content, category, importance, effective_importance, source,
           tags, entities, created_at, updated_at
    FROM insights WHERE deleted_at IS NULL`);
  const insights = insRes.rows.map((r) => ({
    id: String(r.id),
    content: r.content ?? "",
    category: r.category ?? "general",
    importance: Number(r.importance ?? 3),
    effective_importance: Number(r.effective_importance ?? 0.5),
    source: r.source ?? "user",
    tags: parseJsonArray(r.tags),
    entities: parseJsonArray(r.entities),
    created_at: r.created_at ?? "",
    updated_at: r.updated_at ?? "",
  }));

  const byId = new Map(insights.map((i) => [i.id, i]));
  const fileOf = new Map(insights.map((i) => [i.id, insightFilename(i).replace(/\.md$/, "")]));
  const titleOf = new Map(insights.map((i) => [i.id, insightTitle(i)]));

  const edgeRes = await db.execute(`SELECT source_id, target_id, edge_type, weight FROM edges`);
  const linksBySource = new Map();
  for (const e of edgeRes.rows) {
    const sid = String(e.source_id), tid = String(e.target_id);
    if (!byId.has(sid) || !byId.has(tid)) continue;
    if (!linksBySource.has(sid)) linksBySource.set(sid, []);
    linksBySource.get(sid).push({
      type: e.edge_type, weight: Number(e.weight ?? 1),
      targetFile: fileOf.get(tid), targetTitle: titleOf.get(tid),
    });
  }

  const entryTitles = buildEntryTitleMap();

  console.log(`Insights: ${insights.length} | Edges: ${edgeRes.rows.length} | Entry cross-links available: ${entryTitles.size}`);
  if (DRY_RUN) { console.log("DRY_RUN — not writing."); process.exit(0); }

  fs.rmSync(MNEMON_DIR, { recursive: true, force: true });
  fs.mkdirSync(MNEMON_DIR, { recursive: true });
  fs.writeFileSync(path.join(MNEMON_DIR, "README.md"),
    "# Mnemon Mirror (generated)\n\nRead-only. Regenerated nightly from the mnemon agent-memory graph. Do not edit — changes are overwritten.\n");

  let written = 0;
  for (const i of insights) {
    const md = insightToMarkdown(i, linksBySource.get(i.id) || [], entryTitles);
    fs.writeFileSync(path.join(MNEMON_DIR, insightFilename(i)), md, "utf8");
    written++;
  }
  console.log(`Wrote ${written} files to ${MNEMON_DIR}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
