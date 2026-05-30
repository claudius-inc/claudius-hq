#!/usr/bin/env tsx
// @ts-nocheck
/**
 * merge-book-entries.ts — Phase 2 tidy: collapse multi-file same-source clusters
 * (book highlights split across many .md files) into one file per book.
 *
 *   npx tsx scripts/merge-book-entries.ts --vault /root/memoria-vault            # dry-run: manifest + sample
 *   npx tsx scripts/merge-book-entries.ts --vault /root/memoria-vault --apply    # write merges, delete originals
 *
 * Cluster key = source_type + title. Only clusters with >1 file are merged.
 * Highlights are ordered by the numeric filename prefix (capture order) and
 * joined with a horizontal rule. Frontmatter merged: earliest created, latest
 * updated, union of tags. Merged filename = slug(title).md.
 */
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const VAULT = argVal("--vault") || "/root/memoria-vault";
const ENTRIES = path.join(VAULT, "entries");
const APPLY = process.argv.includes("--apply");
// Only merge clusters living at the top level of entries/ (books). Leave subfolders alone.
const SUBDIRS_SKIP = new Set(["google-maps", "preferences", "x-bookmarks", "trading"]);

function argVal(f){ const i=process.argv.indexOf(f); return i>=0?process.argv[i+1]:null; }
function slug(s){ return s.toLowerCase().replace(/['']/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80); }
function numPrefix(name){ const m=name.match(/^(\d+)-/); return m?parseInt(m[1],10):Number.MAX_SAFE_INTEGER; }
function minDate(a,b){ if(!a)return b; if(!b)return a; return a<b?a:b; }
function maxDate(a,b){ if(!a)return b; if(!b)return a; return a>b?a:b; }

// collect top-level entry files only
const topFiles = fs.readdirSync(ENTRIES)
  .filter((n)=> n.endsWith(".md") && fs.statSync(path.join(ENTRIES,n)).isFile())
  .map((n)=> path.join(ENTRIES,n));

const groups = {};
for (const f of topFiles) {
  const { data, content } = matter(fs.readFileSync(f,"utf8"));
  const title = data.title ? String(data.title) : null;
  const st = String(data.source_type||"note");
  if (!title) continue;
  const key = `${st}::${title}`;
  (groups[key]=groups[key]||[]).push({ file:f, base:path.basename(f), data, content:content.trim() });
}

const clusters = Object.entries(groups)
  .filter(([,v])=>v.length>1)
  .map(([key,items])=>{
    const [st,title]=key.split("::");
    items.sort((a,b)=> numPrefix(a.base)-numPrefix(b.base) || a.base.localeCompare(b.base));
    let created=null, updated=null; const tags=new Set(); let author=null;
    for(const it of items){
      created=minDate(created, it.data.created?String(it.data.created):null);
      updated=maxDate(updated, it.data.updated?String(it.data.updated):null);
      if(it.data.author && !author) author=String(it.data.author);
      (Array.isArray(it.data.tags)?it.data.tags:[]).forEach(t=>tags.add(String(t)));
    }
    const fm={ source_type:st }; if(title)fm.title=title; if(author)fm.author=author;
    fm.created=created||updated; if(updated)fm.updated=updated; if(tags.size)fm.tags=[...tags];
    const body=items.map(it=>it.content).join("\n\n---\n\n")+"\n";
    const dest=path.join(ENTRIES, "books", slug(title)+".md"); // books live in entries/books/
    return { st, title, items, dest, md:matter.stringify(body,fm) };
  })
  .sort((a,b)=> b.items.length-a.items.length);

const totalFiles = clusters.reduce((s,c)=>s+c.items.length,0);
console.log(`[merge] clusters=${clusters.length}  files_in_clusters=${totalFiles}  → after merge=${clusters.length} files (net -${totalFiles-clusters.length})`);
console.log(`\n=== MANIFEST (book — files → merged filename) ===`);
for (const c of clusters) console.log(`  ${String(c.items.length).padStart(3)}  ${c.title}\n        → entries/${path.basename(c.dest)}`);

// collision check
const dests = clusters.map(c=>c.dest);
const dupes = dests.filter((d,i)=>dests.indexOf(d)!==i);
if (dupes.length) console.log(`\n⚠️ filename collisions: ${[...new Set(dupes)].join(", ")}`);

if (!APPLY) {
  const sample = clusters.find(c=>c.title.includes("Tao of Pooh")) || clusters[clusters.length-1];
  console.log(`\n=== SAMPLE MERGED FILE: entries/${path.basename(sample.dest)} (${sample.items.length} highlights) ===`);
  console.log(sample.md.split("\n").slice(0,40).join("\n"));
  console.log(`… [truncated]`);
  console.log(`\n[merge] DRY-RUN — no files written. Re-run with --apply.`);
  process.exit(0);
}

let wrote=0, removed=0;
fs.mkdirSync(path.join(ENTRIES, "books"), { recursive: true });
for (const c of clusters) {
  fs.writeFileSync(c.dest, c.md); wrote++;
  for (const it of c.items) if (it.file !== c.dest) { fs.rmSync(it.file); removed++; }
}
console.log(`\n[merge] wrote ${wrote} merged files, removed ${removed} originals.`);
