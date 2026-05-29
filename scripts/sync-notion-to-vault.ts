#!/usr/bin/env tsx
// @ts-nocheck
/**
 * sync-notion-to-vault.ts
 * Mirrors all accessible Notion pages into vault/synced/notion/*.md (one file per page).
 * One-way (Notion is master). Files flow through the importer -> Turso -> mnemon.
 *
 * Usage:
 *   set -a; . /root/.openclaw/workspace/.credentials/notion.env; set +a
 *   npx tsx scripts/sync-notion-to-vault.ts [--vault DIR] [--dry-run] [--limit N]
 */
const { Client } = require("@notionhq/client");
const { NotionToMarkdown } = require("notion-to-md");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const vIdx = argv.indexOf("--vault");
const lIdx = argv.indexOf("--limit");
const VAULT = path.resolve(vIdx >= 0 ? argv[vIdx + 1] : "/root/memoria-vault");
const LIMIT = lIdx >= 0 ? parseInt(argv[lIdx + 1], 10) : Infinity;
const NOTION_DIR = path.join(VAULT, "synced", "notion");

const token = process.env.NOTION_TOKEN;
if (!token) { console.error("NOTION_TOKEN missing"); process.exit(1); }
const notion = new Client({ auth: token });
const n2m = new NotionToMarkdown({ notionClient: notion });

function pageTitle(page) {
  const props = page.properties || {};
  for (const k of Object.keys(props)) {
    const p = props[k];
    if (p && p.type === "title") {
      const t = (p.title || []).map((x) => x.plain_text).join("").trim();
      if (t) return t;
    }
  }
  return "Untitled";
}

async function allPages() {
  const out = [];
  let cursor = undefined;
  do {
    const res = await notion.search({
      filter: { property: "object", value: "page" },
      page_size: 100,
      start_cursor: cursor,
    });
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

function existingMemoriaId(fpath) {
  if (!fs.existsSync(fpath)) return null;
  try { const { data } = matter(fs.readFileSync(fpath, "utf8")); return data["memoria-id"] ?? null; }
  catch { return null; }
}

async function main() {
  console.log(`[notion→vault] OUT=${NOTION_DIR} DRY_RUN=${DRY_RUN} LIMIT=${LIMIT}`);
  let pages = await allPages();
  console.log(`Notion pages accessible: ${pages.length}`);
  if (LIMIT !== Infinity) pages = pages.slice(0, LIMIT);

  if (!DRY_RUN) fs.mkdirSync(NOTION_DIR, { recursive: true });

  let written = 0, skipped = 0;
  const seen = new Set();
  for (const page of pages) {
    const id = page.id;
    const fname = `notion-${id}.md`;
    seen.add(fname);
    const fpath = path.join(NOTION_DIR, fname);
    const title = pageTitle(page);

    let body = "";
    try {
      const blocks = await n2m.pageToMarkdown(id);
      body = (n2m.toMarkdownString(blocks).parent || "").trim();
    } catch (e) { console.error(`  block fetch failed ${id}: ${e.message}`); }

    if ((!title || title === "Untitled") && !body) { skipped++; continue; }

    const fm = {
      source_type: "notion",
      title,
      url: page.url,
    };
    const created = (page.created_time || "").slice(0, 10);
    const updated = (page.last_edited_time || "").slice(0, 10);
    if (created) fm.created = created;
    if (updated) fm.updated = updated;
    const memId = existingMemoriaId(fpath);
    if (memId != null) fm["memoria-id"] = memId;

    const md = matter.stringify((body || title) + "\n", fm);
    if (DRY_RUN) { if (written < 3) console.log(`\n-- ${fname} --\n${md.slice(0, 320)}`); written++; continue; }
    fs.writeFileSync(fpath, md, "utf8");
    written++;
    await new Promise((r) => setTimeout(r, 120));
  }

  if (!DRY_RUN && fs.existsSync(NOTION_DIR)) {
    for (const f of fs.readdirSync(NOTION_DIR)) {
      if (f.startsWith("notion-") && f.endsWith(".md") && !seen.has(f)) {
        fs.rmSync(path.join(NOTION_DIR, f));
        console.log(`  pruned stale ${f}`);
      }
    }
  }
  console.log(`Done. written=${written} skipped=${skipped}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
