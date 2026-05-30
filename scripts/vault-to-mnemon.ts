#!/usr/bin/env tsx
// @ts-nocheck
/**
 * vault-to-mnemon.ts — feeds the Obsidian vault directly into mnemon.
 * Replaces the old vault→Turso→mnemon chain (memoria-to-mnemon.ts).
 *
 * Identity key per entry is the vault-relative PATH (memoria-path:<relpath>),
 * since memoria-id no longer exists. Stable across content edits; a reconcile
 * sweep handles renames/merges/deletes.
 *
 *   npx tsx scripts/vault-to-mnemon.ts --vault /root/memoria-vault --dry-run
 *   npx tsx scripts/vault-to-mnemon.ts --vault /root/memoria-vault --since 2026-05-29   # incremental (cron)
 *   npx tsx scripts/vault-to-mnemon.ts --vault /root/memoria-vault --full               # re-feed everything
 *   npx tsx scripts/vault-to-mnemon.ts --vault /root/memoria-vault --purge-import       # one-time cutover: forget all source=memoria-import
 *   npx tsx scripts/vault-to-mnemon.ts --vault /root/memoria-vault --reconcile          # forget memoria-path insights whose file is gone
 *
 * Input = recursive entries/ tree, EXCLUDING data-only dirs (google-maps).
 * journal lives OUTSIDE entries/ and is therefore never fed.
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { spawn } = require("child_process");
const { createClient } = require("@libsql/client");

const VAULT = argVal("--vault") || "/root/memoria-vault";
const ENTRIES = path.join(VAULT, "entries");
const SKIP_DIRS = new Set(["google-maps"]);
const DRY = process.argv.includes("--dry-run");
const FULL = process.argv.includes("--full");
const SINCE = argVal("--since"); // YYYY-MM-DD, by file mtime
const PURGE_IMPORT = process.argv.includes("--purge-import");
const RECONCILE = process.argv.includes("--reconcile");
const MNEMON_DB = process.env.MNEMON_DB || "/root/.mnemon/data/default/mnemon.db";

function argVal(flag) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; }
const mdb = createClient({ url: `file:${MNEMON_DB}` });

// ---- mapping (mirrors memoria-to-mnemon.ts, adapted to vault source_types) ---
function toCategory(st) {
  switch (st) {
    case "book": case "article": case "notion": case "video": return "fact";
    case "thought": return "insight";
    case "tweet": return "context";
    case "preference": return "preference";
    default: return "fact";
  }
}
function toImportance(st) {
  if (st === "preference") return 4;
  if (st === "book" || st === "thought") return 3;
  return 2;
}
// comma is the --entities delimiter, so escape it REVERSIBLY in the path key
// (a literal space would make the path unrecoverable for the reconcile sweep).
function pathKey(relpath) { return "memoria-path:" + relpath.replace(/,/g, "%2C"); }
function pathFromKey(k) { return k.replace(/%2C/g, ","); }

function buildEntities(rec) {
  const rest = [];
  if (rec.title) rest.push(rec.title);
  if (rec.author) rest.push(rec.author);
  if (rec.source_type) rest.push(rec.source_type);
  for (const t of rec.tags || []) rest.push(t);
  // path key is already comma-free (escaped); only the rest needs sanitizing.
  const cleaned = [...new Set(rest)].map((e) => e.replace(/,/g, " ")).slice(0, 8);
  return [pathKey(rec.relpath), ...cleaned].join(",");
}
const MAXB = 7600; // mnemon caps facts at 8000 BYTES (not chars); leave margin for the prefix
function bytes(s) { return Buffer.byteLength(s, "utf8"); }
function byteClamp(s, max) {
  if (bytes(s) <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bytes(s.slice(0, m)) <= max) lo = m; else hi = m - 1; }
  return s.slice(0, lo);
}
/** Return one or more byte-bounded fact chunks. Oversized entries split at
 *  paragraph boundaries (hard byte-split for huge paragraphs) so long notion
 *  docs / big merged books keep full recall coverage with no data loss. */
function buildFacts(rec) {
  let body = (rec.content || "").trim();
  if (rec.note) body += `\n\n[Note] ${rec.note.trim()}`;
  const head = rec.title ? `${rec.title}\n\n` : "";
  if (bytes(head + body) <= MAXB) return [head + body];
  const room = MAXB - bytes(`${rec.title || ""} (cont. 99)\n\n`); // reserve worst-case prefix
  const paras = body.split(/\n\n+/);
  const pieces = []; let buf = "";
  const flush = () => { if (buf) { pieces.push(buf); buf = ""; } };
  for (let p of paras) {
    while (bytes(p) > room) { flush(); const h = byteClamp(p, room); pieces.push(h); p = p.slice(h.length); }
    if (buf && bytes(buf + "\n\n" + p) > room) { flush(); buf = p; }
    else buf = buf ? buf + "\n\n" + p : p;
  }
  flush();
  return pieces.map((c, i) => (i === 0 ? head : `${rec.title || ""} (cont. ${i + 1})\n\n`) + c);
}

const NOTE_RE = /\n##\s+Note\s*\n/;
function parseEntry(file) {
  const { data, content: body } = matter(fs.readFileSync(file, "utf8"));
  let content = body, note = null;
  const m = body.match(NOTE_RE);
  if (m && m.index !== undefined) { content = body.slice(0, m.index); note = body.slice(m.index + m[0].length).trim() || null; }
  return {
    relpath: file.replace(VAULT + "/", ""),
    source_type: data.source_type ? String(data.source_type) : "note",
    title: data.title != null ? String(data.title) : null,
    author: data.author != null ? String(data.author) : null,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    content: content.trim(),
    note,
  };
}

function listEntries() {
  const out = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (dir === ENTRIES && SKIP_DIRS.has(name)) continue; walk(p); }
      else if (name.endsWith(".md")) out.push(p);
    }
  }
  walk(ENTRIES);
  return out;
}

// ---- mnemon shell helpers ---------------------------------------------------
function mnemon(args) {
  return new Promise((resolve, reject) => {
    const c = spawn("mnemon", args, { env: process.env });
    let out = "", err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    c.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || out))));
    c.on("error", reject);
  });
}
async function remember(fact, category, importance, entities) {
  const out = await mnemon(["remember", "--cat", category, "--imp", String(importance),
    "--entities", entities, "--source", "memoria-import", "--", fact]);
  try { const p = JSON.parse(out.slice(out.indexOf("{"))); return { action: p.action || "added", id: p.id || null }; }
  catch { return { action: /exists|duplicate|skipped|merged/i.test(out) ? "skipped" : "added", id: null }; }
}
async function forget(id) { try { await mnemon(["forget", String(id)]); return true; } catch { return false; } }

// Robust path extraction: JSON.parse (decodes &, unicode, quotes) + %2C decode.
// Regex/LIKE matching is fragile because mnemon escapes special chars in its JSON store.
function relFromEntities(entitiesJson) {
  let arr; try { arr = JSON.parse(entitiesJson); } catch { return null; }
  const e = (arr || []).find((x) => typeof x === "string" && x.startsWith("memoria-path:"));
  return e ? pathFromKey(e.slice("memoria-path:".length)) : null;
}
async function allPathInsights() {
  const res = await mdb.execute({ sql: `SELECT id, entities FROM insights WHERE deleted_at IS NULL AND source = 'memoria-import' AND entities LIKE '%memoria-path:%'` });
  return res.rows.map((r) => ({ id: r.id, rel: relFromEntities(r.entities) })).filter((x) => x.rel != null);
}
async function forgetByPath(relpath) {
  const all = await allPathInsights();
  let n = 0;
  for (const it of all) if (it.rel === relpath && (await forget(it.id))) n++;
  return n;
}

// ---- modes ------------------------------------------------------------------
async function runPurgeImport() {
  const res = await mdb.execute({ sql: `SELECT id FROM insights WHERE deleted_at IS NULL AND source = 'memoria-import'` });
  console.log(`[purge-import] ${res.rows.length} memoria-import insights to forget${DRY ? " (dry-run)" : ""}`);
  if (DRY) return;
  let n = 0; for (const r of res.rows) if (await forget(r.id)) n++;
  console.log(`[purge-import] forgot ${n}`);
}

async function runReconcile() {
  const all = await allPathInsights();
  let gone = 0;
  for (const it of all) {
    if (!fs.existsSync(path.join(VAULT, it.rel))) {
      console.log(`[reconcile] orphan: ${it.rel}`);
      if (!DRY && (await forget(it.id))) gone++;
    }
  }
  console.log(`[reconcile] forgot ${gone} orphaned insights${DRY ? " (dry-run)" : ""}`);
}

async function runFeed() {
  const sinceMs = SINCE ? Date.parse(SINCE) : null;
  let files = listEntries();
  if (sinceMs && !FULL) files = files.filter((f) => fs.statSync(f).mtime.getTime() >= sinceMs);
  console.log(`[feed] ${files.length} files${SINCE && !FULL ? ` since ${SINCE}` : " (full)"}${DRY ? " (dry-run)" : ""}`);
  let added = 0, chunks = 0, removed = 0, failed = 0;
  for (const f of files) {
    const rec = parseEntry(f);
    if (!rec.content) continue;
    const facts = buildFacts(rec), cat = toCategory(rec.source_type), imp = toImportance(rec.source_type), ents = buildEntities(rec);
    if (DRY) { console.log(`  would feed [${cat} imp=${imp}] ${facts.length}ch ${rec.relpath}`); chunks += facts.length; added++; continue; }
    try {
      // delete-then-insert: drop any prior insights for this path, re-add all chunks fresh.
      removed += await forgetByPath(rec.relpath);
      for (const fact of facts) { await remember(fact, cat, imp, ents); chunks++; await new Promise((r) => setTimeout(r, 70)); }
      added++;
    } catch (e) { failed++; console.error(`  FAIL ${rec.relpath}: ${e.message}`); }
  }
  console.log(`[feed] files=${added} chunksWritten=${chunks} priorRemoved=${removed} failed=${failed}`);
}

(async () => {
  if (PURGE_IMPORT) await runPurgeImport();
  if (!PURGE_IMPORT && !RECONCILE) await runFeed();
  if (RECONCILE) await runReconcile();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
