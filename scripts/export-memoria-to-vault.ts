#!/usr/bin/env tsx
// @ts-nocheck
/**
 * export-memoria-to-vault.ts
 * One-time (re-runnable) export of Memoria entries from HQ Turso → an Obsidian vault.
 * One markdown file per entry. Frontmatter carries `memoria-id` as the round-trip key
 * so a later importer can match files back to rows on rename.
 *
 * Canonical fields only. Derived AI artifacts (aiSummary, wiki pages, insights, graph
 * snapshots) are intentionally NOT exported — Obsidian replaces those.
 *
 * Usage (run from claudius-hq root where @libsql/client is installed):
 *   set -a; . ./.env.local; set +a
 *   npx tsx scripts/export-memoria-to-vault.ts [--out DIR] [--dry-run] [--include-ai-summary]
 *
 * Defaults:
 *   --out  ../memoria-vault   (sibling of claudius-hq; make it its own git repo)
 */

const { createClient } = require("@libsql/client");
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};

const DRY_RUN = flag("--dry-run");
const INCLUDE_AI_SUMMARY = flag("--include-ai-summary");
const OUT_DIR = path.resolve(opt("--out", path.join(process.cwd(), "..", "memoria-vault", "Entries")));

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN env vars");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

/** Slugify a string for use in a filename. */
function slugify(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** First N words of free text, for a fallback filename. */
function firstWords(s, n) {
  return (s || "").trim().split(/\s+/).slice(0, n).join(" ");
}

/** Minimal YAML scalar emitter — quotes when needed. */
function yamlScalar(v) {
  if (v === null || v === undefined || v === "") return '""';
  const s = String(v);
  if (/[:#\[\]{}",'\n]|^\s|\s$|^[&*!|>%@`]/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** ISO date portion (YYYY-MM-DD) from a datetime string, or undefined. */
function dateOnly(s) {
  if (!s) return undefined;
  const m = String(s).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : undefined;
}

function buildFrontmatter(entry, tagNames) {
  const fm = [];
  fm.push(`memoria-id: ${entry.id}`);
  fm.push(`source_type: ${yamlScalar(entry.sourceType)}`);
  if (entry.sourceTitle) fm.push(`title: ${yamlScalar(entry.sourceTitle)}`);
  if (entry.sourceAuthor) fm.push(`author: ${yamlScalar(entry.sourceAuthor)}`);
  if (entry.sourceUrl) fm.push(`url: ${yamlScalar(entry.sourceUrl)}`);
  if (entry.sourceLocation) fm.push(`location: ${yamlScalar(entry.sourceLocation)}`);
  if (entry.isFavorite) fm.push(`favorite: true`);
  const captured = dateOnly(entry.capturedAt) || dateOnly(entry.createdAt);
  if (captured) fm.push(`captured: ${captured}`);
  if (dateOnly(entry.createdAt)) fm.push(`created: ${dateOnly(entry.createdAt)}`);
  if (dateOnly(entry.updatedAt)) fm.push(`updated: ${dateOnly(entry.updatedAt)}`);

  // Merge explicit tags + aiTags into one Obsidian-native list.
  const ai = (entry.aiTags || "")
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const allTags = [...new Set([...tagNames, ...ai])];
  if (allTags.length) {
    fm.push(`tags: [${allTags.map((t) => yamlScalar(t)).join(", ")}]`);
  }
  return `---\n${fm.join("\n")}\n---\n`;
}

function buildBody(entry) {
  let body = "";
  if (INCLUDE_AI_SUMMARY && entry.aiSummary) {
    body += `> [!summary] AI summary\n> ${entry.aiSummary.trim().replace(/\n/g, "\n> ")}\n\n`;
  }
  body += (entry.content || "").trim() + "\n";
  if (entry.myNote) {
    body += `\n## Note\n\n${entry.myNote.trim()}\n`;
  }
  return body;
}

function fileNameFor(entry) {
  const base = entry.sourceTitle
    ? slugify(entry.sourceTitle)
    : slugify(firstWords(entry.content, 8));
  const stem = base || "entry";
  return `${entry.id}-${stem}.md`;
}

async function fetchTagMap() {
  const map = new Map();
  const res = await db.execute(`
    SELECT et.entry_id AS entryId, t.name AS name
    FROM memoria_entry_tags et
    JOIN memoria_tags t ON t.id = et.tag_id
  `);
  for (const row of res.rows) {
    if (!map.has(row.entryId)) map.set(row.entryId, []);
    map.get(row.entryId).push(row.name);
  }
  return map;
}

async function fetchEntries() {
  const res = await db.execute(`
    SELECT id, content, source_type AS sourceType, source_title AS sourceTitle,
           source_author AS sourceAuthor, source_url AS sourceUrl,
           source_location AS sourceLocation, my_note AS myNote,
           ai_tags AS aiTags, ai_summary AS aiSummary,
           is_favorite AS isFavorite, captured_at AS capturedAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM memoria_entries
    WHERE is_archived = 0
    ORDER BY id
  `);
  return res.rows;
}

async function main() {
  console.log(`[memoria→vault] OUT=${OUT_DIR} DRY_RUN=${DRY_RUN} INCLUDE_AI_SUMMARY=${INCLUDE_AI_SUMMARY}`);

  const [entries, tagMap] = await Promise.all([fetchEntries(), fetchTagMap()]);
  console.log(`Fetched ${entries.length} entries, tags for ${tagMap.size} entries.`);

  if (!DRY_RUN) fs.mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  const seen = new Set();
  for (const entry of entries) {
    const tagNames = tagMap.get(entry.id) || [];
    let name = fileNameFor(entry);
    // Guard against the rare slug collision (same id can't repeat, so this is belt-and-suspenders).
    while (seen.has(name)) name = name.replace(/\.md$/, "-x.md");
    seen.add(name);

    const md = buildFrontmatter(entry, tagNames) + "\n" + buildBody(entry);

    if (DRY_RUN) {
      if (written < 3) console.log(`\n--- ${name} ---\n${md.slice(0, 400)}...`);
      written++;
      continue;
    }
    fs.writeFileSync(path.join(OUT_DIR, name), md, "utf8");
    written++;
  }

  console.log(`\nDone. ${DRY_RUN ? "Would write" : "Wrote"} ${written} files to ${OUT_DIR}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
