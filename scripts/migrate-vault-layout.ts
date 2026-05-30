#!/usr/bin/env tsx
// @ts-nocheck
/**
 * migrate-vault-layout.ts — one-time vault refactor (Phase 1).
 *
 * Folds parked folders into entries/ and normalizes EVERY entry onto one uniform
 * template (HQ Memoria schema, adapted; no memoria-id). Idempotent.
 *
 *   npx tsx scripts/migrate-vault-layout.ts --vault /root/memoria-vault          # dry-run (default)
 *   npx tsx scripts/migrate-vault-layout.ts --vault /root/memoria-vault --apply  # write changes
 *   npx tsx scripts/migrate-vault-layout.ts --vault /root/memoria-vault --check  # validate only
 *
 * Uniform frontmatter (fixed key order; only non-empty keys emitted):
 *   source_type, title, author, url, created, updated, tags
 * Body: content, then optional "## Note\n\n<reflection>".
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const VAULT = argVal("--vault") || "/root/memoria-vault";
const APPLY = process.argv.includes("--apply");
const CHECK = process.argv.includes("--check");

const ENTRIES = path.join(VAULT, "entries");
const SYNCED = path.join(VAULT, "synced");
const NOTION = path.join(SYNCED, "notion");
const CLAUDE = path.join(SYNCED, "claude", "memory");
const PREFS = path.join(ENTRIES, "preferences");

const ALLOWED_TYPES = new Set(["book", "article", "video", "tweet", "notion", "preference", "note", "thought"]);
// Normalize legacy/typo source_type values to the canonical set.
const TYPE_ALIAS = { preferences: "preference", quote: "book", highlight: "book" };
// Folders under entries/ that are NOT normalized entries (data / special-cased).
const SKIP_DIRS = new Set(["google-maps"]);

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}
function asDate(v, fallback) {
  if (v == null || v === "") return fallback;
  // gray-matter/js-yaml parses unquoted ISO dates into JS Date objects.
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : fallback;
}
function mtimeDate(file) {
  return fs.statSync(file).mtime.toISOString().slice(0, 10);
}
function asTags(v, extra = []) {
  let t = [];
  if (Array.isArray(v)) t = v.map((x) => String(x).trim()).filter(Boolean);
  else if (typeof v === "string" && v.trim()) t = v.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  for (const e of extra) if (e && !t.includes(e)) t.push(e);
  return [...new Set(t)];
}

/** Emit uniform markdown from a normalized record. */
function serialize(rec) {
  const fm = {};
  fm.source_type = rec.source_type;
  if (rec.title) fm.title = rec.title;
  if (rec.author) fm.author = rec.author;
  if (rec.url) fm.url = rec.url;
  fm.created = rec.created;
  if (rec.updated) fm.updated = rec.updated;
  if (rec.tags && rec.tags.length) fm.tags = rec.tags;
  let body = (rec.content || "").trim() + "\n";
  if (rec.note) body += `\n## Note\n\n${rec.note.trim()}\n`;
  return matter.stringify(body, fm);
}

const NOTE_RE = /\n##\s+Note\s*\n/;
function splitNote(body) {
  const m = body.match(NOTE_RE);
  if (!m || m.index === undefined) return { content: body.trim(), note: null };
  return { content: body.slice(0, m.index).trim(), note: body.slice(m.index + m[0].length).trim() || null };
}

// ---- per-source readers → normalized record ---------------------------------

function readStandard(file, { forceType, extraTags = [] } = {}) {
  const { data, content: body } = matter(fs.readFileSync(file, "utf8"));
  const { content, note } = splitNote(body);
  let st = forceType || (data.source_type ? String(data.source_type) : "note");
  if (TYPE_ALIAS[st]) st = TYPE_ALIAS[st];
  if (!ALLOWED_TYPES.has(st)) st = "note";
  const created = asDate(data.created, asDate(data.captured, asDate(data.updated, mtimeDate(file))));
  return {
    source_type: st,
    title: data.title != null ? String(data.title) : null,
    author: data.author != null ? String(data.author) : null,
    url: data.url != null ? String(data.url) : null,
    created,
    updated: asDate(data.updated, null),
    tags: asTags(data.tags, extraTags),
    content,
    note,
  };
}

function readXBookmark(file) {
  const { data, content: body } = matter(fs.readFileSync(file, "utf8"));
  const { content, note } = splitNote(body);
  // Filename carries the actual tweet date ("2020-10-20-Author-Title.md"); prefer it
  // over scraped_date so the tweet timeline is preserved.
  const fnameDate = (path.basename(file).match(/^(\d{4}-\d{2}-\d{2})-/) || [])[1] || null;
  return {
    source_type: "tweet",
    title: data.title != null ? String(data.title) : null,
    author: data.author != null ? String(data.author) : null,
    url: data.url != null ? String(data.url) : null,
    created: fnameDate || asDate(data.created, asDate(data.scraped_date, mtimeDate(file))),
    updated: null,
    tags: asTags(data.tags, ["twitter"]),
    content, // retains the "# Tweet by …" heading + text; username preserved via url/author
    note,
  };
}

function readClaudePref(file) {
  const { data, content: body } = matter(fs.readFileSync(file, "utf8"));
  const type = data.type || (data.metadata && data.metadata.type) || "memory";
  const desc = data.description ? String(data.description).trim() : "";
  const content = [desc, body.trim()].filter(Boolean).join("\n\n");
  return {
    source_type: "preference",
    title: data.name != null ? String(data.name) : path.basename(file, ".md"),
    author: null,
    url: null,
    created: mtimeDate(file),
    updated: null,
    tags: asTags([], ["preference", String(type)]),
    content,
    note: null,
  };
}

// ---- walk -------------------------------------------------------------------

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** All normalizable entry .md files currently under entries/ (excl. SKIP_DIRS). */
function listEntryMd() {
  const out = [];
  for (const name of fs.readdirSync(ENTRIES)) {
    const p = path.join(ENTRIES, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      out.push(...walk(p));
    } else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

function rel(p) { return p.replace(VAULT + "/", ""); }

// ---- check mode -------------------------------------------------------------

if (CHECK) {
  const files = listEntryMd();
  const violations = [];
  for (const f of files) {
    const raw = fs.readFileSync(f, "utf8");
    let data;
    try { data = matter(raw).data; } catch (e) { violations.push([rel(f), "unparseable frontmatter"]); continue; }
    if (data["memoria-id"] != null) violations.push([rel(f), "has memoria-id"]);
    if (!data.source_type) violations.push([rel(f), "missing source_type"]);
    else if (!ALLOWED_TYPES.has(String(data.source_type))) violations.push([rel(f), `source_type=${data.source_type} not allowed`]);
    if (!data.created) violations.push([rel(f), "missing created"]);
  }
  console.log(`[check] scanned ${files.length} entry files under entries/ (excl ${[...SKIP_DIRS].join(",")})`);
  if (!violations.length) console.log("[check] ✓ 0 violations — all uniform");
  else {
    console.log(`[check] ✗ ${violations.length} violations:`);
    for (const [f, why] of violations.slice(0, 50)) console.log(`  - ${f}: ${why}`);
    if (violations.length > 50) console.log(`  … +${violations.length - 50} more`);
  }
  process.exit(violations.length ? 1 : 0);
}

// ---- migration --------------------------------------------------------------

const ops = []; // {action, src, dest, rec}

// 1. Existing top-level entries/*.md  → normalize in place
for (const name of fs.readdirSync(ENTRIES)) {
  const p = path.join(ENTRIES, name);
  if (fs.statSync(p).isFile() && name.endsWith(".md")) {
    ops.push({ action: "normalize", src: p, dest: p, rec: readStandard(p) });
  }
}
// 2. entries/trading/*.md → normalize in place (source_type note unless set)
for (const f of walk(path.join(ENTRIES, "trading"))) {
  ops.push({ action: "normalize", src: f, dest: f, rec: readStandard(f) });
}
// 3. entries/x-bookmarks/*.md → normalize in place (tweet)
for (const f of walk(path.join(ENTRIES, "x-bookmarks"))) {
  ops.push({ action: "normalize", src: f, dest: f, rec: readXBookmark(f) });
}
// 4. synced/notion/*.md → entries/<file>.md (flat) + notion tag
for (const f of walk(NOTION)) {
  const dest = path.join(ENTRIES, path.basename(f));
  ops.push({ action: "fold-notion", src: f, dest, rec: readStandard(f, { forceType: "notion", extraTags: ["notion"] }) });
}
// 5. synced/claude/memory/**/*.md → entries/preferences/<base>.md (skip MEMORY.md/README.md)
for (const f of walk(CLAUDE)) {
  const base = path.basename(f);
  if (base === "MEMORY.md" || base === "README.md") continue;
  const dest = path.join(PREFS, base);
  ops.push({ action: "fold-pref", src: f, dest, rec: readClaudePref(f) });
}

// summary
const byAction = {};
const byType = {};
for (const o of ops) {
  byAction[o.action] = (byAction[o.action] || 0) + 1;
  byType[o.rec.source_type] = (byType[o.rec.source_type] || 0) + 1;
}
console.log(`[migrate] vault=${VAULT} mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`[migrate] planned ops:`, byAction);
console.log(`[migrate] resulting source_type tally:`, byType);
console.log(`[migrate] synced/ to delete: ${fs.existsSync(SYNCED) ? walk(SYNCED).length + " md (+ non-md)" : "absent"}`);

// show a few sample before/after for each action
const seen = {};
for (const o of ops) {
  if ((seen[o.action] = (seen[o.action] || 0) + 1) > 1) continue;
  console.log(`\n--- sample [${o.action}] ${rel(o.src)} → ${rel(o.dest)}`);
  console.log(serialize(o.rec).split("\n").slice(0, 12).join("\n"));
}

if (!APPLY) {
  console.log(`\n[migrate] DRY-RUN — no files written. Re-run with --apply to execute.`);
  process.exit(0);
}

// APPLY
fs.mkdirSync(PREFS, { recursive: true });
let wrote = 0, moved = 0;
for (const o of ops) {
  const md = serialize(o.rec);
  fs.writeFileSync(o.dest, md);
  wrote++;
  if (o.src !== o.dest) { fs.rmSync(o.src); moved++; }
}
// delete synced/ entirely (notion folded, claude folded, mnemon mirror dead)
if (fs.existsSync(SYNCED)) fs.rmSync(SYNCED, { recursive: true });

console.log(`\n[migrate] wrote ${wrote} files, removed ${moved} originals, deleted synced/.`);
console.log(`[migrate] done. Run --check to validate.`);
