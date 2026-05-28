# Memoria → Obsidian Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Memoria from a Turso-canonical web app to an Obsidian markdown vault that is the source of truth, with HQ demoted to a read-only web view, mnemon mirrored read-only into the vault, and the graph/wiki features (which only existed to mimic Obsidian) removed.

**Architecture:** Plain markdown files in a git-backed vault become canonical. A nightly importer reads `vault/Entries/*.md` and upserts the Turso `memoria_entries` table (keyed on a `memoria-id` frontmatter field), so HQ keeps reading Turso unchanged — Turso is now a cache fed by the vault instead of by the HQ "Add Entry" UI. A second nightly job exports mnemon's SQLite insights+edges into `vault/Mnemon/*.md` as a read-only mirror, turning mnemon's 10k edges into Obsidian `[[wikilinks]]`. The data flow is a clean DAG with no loops: `vault/Entries → Turso → mnemon → vault/Mnemon`.

**Tech Stack:** TypeScript + `tsx`, `@libsql/client` (already a dep; also opens local SQLite via `file:` URLs), `gray-matter` (new dev dep, robust YAML frontmatter parsing), Next.js 14 App Router (HQ), vitest (tests), bash + cron (scheduling).

---

## Current State (verified 2026-05-28)

- **HQ Memoria:** Turso-backed. 511 entries, 29 tags, 18 wiki pages, 8 insights.
  - Read view: `src/app/memoria/page.tsx`; list API `src/app/api/memoria/route.ts` (`GET` line 17, `POST` line 106).
  - Obsidian-mimicking features to delete: `src/app/memoria/graph/`, `src/app/memoria/wiki/`, nav tabs in `src/app/memoria/_components/MemoriaHeader.tsx:32,57,68`.
- **mnemon:** local SQLite at `/root/.mnemon/data/default/mnemon.db` (tables `insights`, `edges`, `oplog`). 534 insights, 10624 edges.
- **Vault:** `/root/memoria-vault` — its own git repo, **no remote yet**, 511 flat `*.md` files (already exported by `scripts/export-memoria-to-vault.ts`).
- **Local crons** (`/root/.openclaw/workspace/scripts/`, run nightly):
  - `35 23 * * *` `sync-memoria-to-mnemon.sh` (Turso entries → mnemon, `--since yesterday`)
  - `55 23 * * *` `sync-mnemon-to-hq.sh` (mnemon → Turso `mnemon_graph_snapshots`, **feeds the graph view — to be deleted**)
  - `50 23 * * *` `backup-mnemon.sh` (unchanged)
- **Credentials:** `projects/claudius-hq/.env.local` (sourced by cron wrappers) has `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.

## End State

```
memoria-vault/                 (PRIVATE git repo — contains memory about the user)
  Entries/      ← canonical, two-way: human (Obsidian) + Claude Code edit; HQ imports from here
  Mnemon/       ← mnemon insights mirror: read-only, cron-regenerated, edges → [[wikilinks]]
  README.md     ← explains which folders are editable vs generated
```

- HQ = read-only web view of `Entries/` (still reads Turso; Turso fed by importer). Graph + wiki gone.
- Cron data flow: `vault/Entries → (import) → Turso → (existing) → mnemon → (export) → vault/Mnemon`.
- `Claude/` brain layer (auto-memory + skills view) is **Phase 5, optional.**

## File Structure

**New files (HQ repo, `projects/claudius-hq/`):**
- `src/lib/memoria/vault.ts` — pure functions: parse/serialize entry markdown, frontmatter↔row mapping, dirty-check. Imported by importer + tests.
- `scripts/import-vault-to-memoria.ts` — CLI: read `Entries/*.md`, upsert Turso, stamp new ids back, archive deletions.
- `src/lib/memoria/mnemon-vault.ts` — pure functions: insight→markdown, edges→wikilinks, filename/slug helpers.
- `scripts/export-mnemon-to-vault.ts` — CLI: query mnemon SQLite, write `Mnemon/*.md`.
- `src/lib/memoria/__tests__/vault.test.ts`, `src/lib/memoria/__tests__/mnemon-vault.test.ts` — vitest unit tests.

**New files (workspace, `/root/.openclaw/workspace/scripts/`):**
- `import-vault-to-memoria.sh` — cron wrapper (git pull vault → import → git push id-stamps).
- `export-mnemon-to-vault.sh` — cron wrapper (export → git commit/push mirror).

**Modified:**
- `scripts/export-memoria-to-vault.ts` — default `--out` now targets `Entries/` subdir.
- `src/app/api/memoria/route.ts` — `POST` becomes `410 Gone`.
- `src/app/memoria/_components/MemoriaHeader.tsx` — remove graph/wiki tabs.
- `package.json` — add `gray-matter` dev dep.
- crontab — add 2 jobs, remove 1.

**Deleted:**
- `src/app/memoria/graph/`, `src/app/memoria/wiki/` (pages).
- `src/app/api/memoria/graph-qa/`, `src/app/api/memoria/wiki/`, `src/app/api/memoria/mnemon/graph/` (APIs).
- `src/app/memoria/_components/AddEntryModal.tsx`, `GraphQAPanel.tsx` (write/graph UI).
- `scripts/generate-wiki-pages.ts`.

**CORRECTION (during execution):** `mnemonGraphSnapshots` (table + the `sync-mnemon-to-hq.ts` script + its cron) are NOT graph-only — they back **semantic search**, the **QA recall hook** (`mnemon-recall.ts`), and the **derived-insights** panel, all of which are kept. So they are **NOT deleted**. Only `memoriaWikiPages` is removed from the schema. The graph snapshot keeps refreshing nightly.

---

## Phase 0 — Prerequisites & Vault Restructure

### Task 0.1: Make the vault a private remote-backed repo

**Files:** none (manual infra step).

- [ ] **Step 1: Create a PRIVATE remote** (GitHub private repo or self-hosted). The vault holds memory *about the user* — it MUST NOT be public. Example with `gh`:

```bash
cd /root/memoria-vault
gh repo create memoria-vault --private --source=. --remote=origin
git push -u origin master
```

- [ ] **Step 2: Verify remote is private**

```bash
gh repo view memoria-vault --json visibility -q .visibility
```
Expected: `private`

- [ ] **Step 3: Confirm Obsidian sync path is decided** (the user opens this repo on their device via git or Obsidian Sync). Record the choice in the vault README in Task 0.3. No code.

### Task 0.2: Move the 511 entries into `Entries/`

**Files:** Modify: `/root/memoria-vault/*.md` → `/root/memoria-vault/Entries/*.md`

- [ ] **Step 1: git mv all entry files into `Entries/`**

```bash
cd /root/memoria-vault
mkdir -p Entries
git mv $(ls *.md) Entries/ 2>/dev/null || { for f in *.md; do git mv "$f" "Entries/$f"; done; }
```

- [ ] **Step 2: Verify**

```bash
ls Entries/*.md | wc -l   # expect 511
ls *.md 2>/dev/null | wc -l  # expect 0
```

- [ ] **Step 3: Point the exporter default at `Entries/`** so re-runs land in the right place.

In `projects/claudius-hq/scripts/export-memoria-to-vault.ts`, change the default out dir:

```ts
const OUT_DIR = path.resolve(opt("--out", path.join(process.cwd(), "..", "memoria-vault", "Entries")));
```

- [ ] **Step 4: Commit (HQ repo)**

```bash
cd /root/.openclaw/workspace/projects/claudius-hq
git add scripts/export-memoria-to-vault.ts
git commit -m "chore(memoria): exporter writes to vault Entries/ subdir"
```

- [ ] **Step 5: Commit (vault repo)**

```bash
cd /root/memoria-vault
git add -A && git commit -m "chore: move entries into Entries/ subfolder" && git push
```

### Task 0.3: Vault README + gitignore

**Files:** Create: `/root/memoria-vault/README.md`; Modify: `/root/memoria-vault/.gitignore`

- [ ] **Step 1: Write README.md**

```markdown
# Memoria Vault

Canonical knowledge base. Source of truth for Memoria (Claudius HQ reads from here).

## Folders
- `Entries/` — **editable.** Your notes. Edit in Obsidian or via Claude Code. Synced to HQ nightly.
- `Mnemon/` — **generated, read-only.** Mirror of the mnemon agent-memory graph. Regenerated nightly. Editing here does nothing (overwritten on next run).

## Rules
- This repo is PRIVATE. It contains memory about the user. Do not make it public.
- New notes in `Entries/` get a `memoria-id` stamped into frontmatter automatically by the importer.
- Do not hand-edit `memoria-id`.
```

- [ ] **Step 2: Append to .gitignore** (Obsidian local cruft already ignored; nothing extra needed since the repo is private and `Mnemon/` IS committed so it syncs to devices)

```bash
cd /root/memoria-vault
printf "Entries/.obsidian/\n" >> .gitignore  # if Obsidian config lands inside
```

- [ ] **Step 3: Commit**

```bash
git add README.md .gitignore && git commit -m "docs: vault README + ignore rules" && git push
```

---

## Phase 1 — Importer (vault/Entries → Turso)

### Task 1.1: Add gray-matter dependency

**Files:** Modify: `projects/claudius-hq/package.json`

- [ ] **Step 1: Install**

```bash
cd /root/.openclaw/workspace/projects/claudius-hq
npm install -D gray-matter
```

- [ ] **Step 2: Verify it resolves**

```bash
node -e "require('gray-matter'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add gray-matter for vault frontmatter parsing"
```

### Task 1.2: Pure vault parse/serialize module (TDD)

**Files:**
- Create: `src/lib/memoria/vault.ts`
- Test: `src/lib/memoria/__tests__/vault.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/memoria/__tests__/vault.test.ts
import { describe, it, expect } from "vitest";
import { parseEntryFile, serializeEntryFile, rowDirty, type EntryRow } from "../vault";

const SAMPLE = `---
memoria-id: 42
source_type: book
title: "Antifragile"
author: Nassim Taleb
favorite: true
created: 2026-03-12
updated: 2026-03-12
tags: [risk, philosophy]
---

Things that gain from disorder.

## Note

My takeaway here.
`;

describe("parseEntryFile", () => {
  it("maps frontmatter + body to a row", () => {
    const row = parseEntryFile(SAMPLE);
    expect(row.id).toBe(42);
    expect(row.source_type).toBe("book");
    expect(row.source_title).toBe("Antifragile");
    expect(row.source_author).toBe("Nassim Taleb");
    expect(row.is_favorite).toBe(1);
    expect(row.content).toBe("Things that gain from disorder.");
    expect(row.my_note).toBe("My takeaway here.");
    expect(row.tags).toEqual(["risk", "philosophy"]);
  });

  it("returns id=null for a new note with no memoria-id", () => {
    const row = parseEntryFile(`---\nsource_type: thought\n---\n\nA fresh idea.\n`);
    expect(row.id).toBeNull();
    expect(row.content).toBe("A fresh idea.");
    expect(row.my_note).toBeNull();
  });
});

describe("serializeEntryFile", () => {
  it("round-trips a parsed row back to markdown with stamped id", () => {
    const row = parseEntryFile(`---\nsource_type: thought\n---\n\nFresh.\n`);
    const stamped = serializeEntryFile({ ...row, id: 99 });
    expect(stamped).toMatch(/memoria-id: 99/);
    const reparsed = parseEntryFile(stamped);
    expect(reparsed.id).toBe(99);
    expect(reparsed.content).toBe("Fresh.");
  });
});

describe("rowDirty", () => {
  it("is false when file matches db", () => {
    const file = parseEntryFile(SAMPLE);
    const db: EntryRow = { ...file };
    expect(rowDirty(file, db)).toBe(false);
  });
  it("is true when content differs", () => {
    const file = parseEntryFile(SAMPLE);
    const db: EntryRow = { ...file, content: "different" };
    expect(rowDirty(file, db)).toBe(true);
  });
  it("is true when tag sets differ regardless of order", () => {
    const file = parseEntryFile(SAMPLE);
    const db: EntryRow = { ...file, tags: ["philosophy"] };
    expect(rowDirty(file, db)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/memoria/__tests__/vault.test.ts`
Expected: FAIL — cannot find module `../vault`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/memoria/vault.ts
import matter from "gray-matter";

export interface EntryRow {
  id: number | null;
  content: string;
  source_type: string;
  source_title: string | null;
  source_author: string | null;
  source_url: string | null;
  source_location: string | null;
  my_note: string | null;
  is_favorite: number;
  created_at: string | null;
  updated_at: string | null;
  captured_at: string | null;
  tags: string[];
}

const NOTE_HEADING = /\n##\s+Note\s*\n/;

function splitBody(body: string): { content: string; my_note: string | null } {
  const m = body.match(NOTE_HEADING);
  if (!m || m.index === undefined) {
    return { content: body.trim(), my_note: null };
  }
  return {
    content: body.slice(0, m.index).trim(),
    my_note: body.slice(m.index + m[0].length).trim() || null,
  };
}

export function parseEntryFile(raw: string): EntryRow {
  const { data, content: body } = matter(raw);
  const { content, my_note } = splitBody(body);
  const tags = Array.isArray(data.tags)
    ? data.tags.map((t: unknown) => String(t)).filter(Boolean)
    : [];
  return {
    id: data["memoria-id"] != null ? Number(data["memoria-id"]) : null,
    content,
    source_type: String(data.source_type ?? "thought"),
    source_title: data.title != null ? String(data.title) : null,
    source_author: data.author != null ? String(data.author) : null,
    source_url: data.url != null ? String(data.url) : null,
    source_location: data.location != null ? String(data.location) : null,
    my_note,
    is_favorite: data.favorite ? 1 : 0,
    created_at: data.created != null ? String(data.created) : null,
    updated_at: data.updated != null ? String(data.updated) : null,
    captured_at: data.captured != null ? String(data.captured) : null,
    tags,
  };
}

export function serializeEntryFile(row: EntryRow): string {
  const fm: Record<string, unknown> = {};
  if (row.id != null) fm["memoria-id"] = row.id;
  fm.source_type = row.source_type;
  if (row.source_title) fm.title = row.source_title;
  if (row.source_author) fm.author = row.source_author;
  if (row.source_url) fm.url = row.source_url;
  if (row.source_location) fm.location = row.source_location;
  if (row.is_favorite) fm.favorite = true;
  if (row.captured_at) fm.captured = row.captured_at;
  if (row.created_at) fm.created = row.created_at;
  if (row.updated_at) fm.updated = row.updated_at;
  if (row.tags.length) fm.tags = row.tags;

  let body = row.content.trim() + "\n";
  if (row.my_note) body += `\n## Note\n\n${row.my_note.trim()}\n`;
  return matter.stringify(body, fm);
}

export function rowDirty(file: EntryRow, db: EntryRow): boolean {
  const norm = (s: string | null) => (s ?? "").trim();
  if (norm(file.content) !== norm(db.content)) return true;
  if (norm(file.my_note) !== norm(db.my_note)) return true;
  if (norm(file.source_type) !== norm(db.source_type)) return true;
  if (norm(file.source_title) !== norm(db.source_title)) return true;
  if (norm(file.source_author) !== norm(db.source_author)) return true;
  if (norm(file.source_url) !== norm(db.source_url)) return true;
  if (norm(file.source_location) !== norm(db.source_location)) return true;
  if (file.is_favorite !== db.is_favorite) return true;
  const a = [...file.tags].sort().join("|");
  const b = [...db.tags].sort().join("|");
  if (a !== b) return true;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/memoria/__tests__/vault.test.ts`
Expected: PASS (3 suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/memoria/vault.ts src/lib/memoria/__tests__/vault.test.ts
git commit -m "feat(memoria): pure vault entry parse/serialize/dirty module"
```

### Task 1.3: Importer CLI

**Files:** Create: `scripts/import-vault-to-memoria.ts`

- [ ] **Step 1: Write the importer**

```ts
#!/usr/bin/env tsx
// @ts-nocheck
/**
 * import-vault-to-memoria.ts
 * Reads vault/Entries/*.md and upserts the Turso memoria_entries table.
 * - files WITH memoria-id: update Turso row if changed
 * - files WITHOUT memoria-id: insert, then stamp the new id back into the file
 * - Turso rows whose id is absent from the vault: soft-archive (is_archived=1)
 *
 * Usage (from claudius-hq root):
 *   set -a; . ./.env.local; set +a
 *   npx tsx scripts/import-vault-to-memoria.ts [--vault DIR] [--dry-run]
 */
const { createClient } = require("@libsql/client");
const fs = require("fs");
const path = require("path");
const { parseEntryFile, serializeEntryFile, rowDirty } = require("../src/lib/memoria/vault.ts");

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const vaultArg = argv.indexOf("--vault");
const VAULT = path.resolve(vaultArg >= 0 ? argv[vaultArg + 1] : path.join(process.cwd(), "..", "memoria-vault"));
const ENTRIES_DIR = path.join(VAULT, "Entries");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function nowIso() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function loadDbRows() {
  const res = await db.execute(`
    SELECT e.id, e.content, e.source_type, e.source_title, e.source_author,
           e.source_url, e.source_location, e.my_note, e.is_favorite,
           e.is_archived, e.created_at, e.updated_at, e.captured_at,
           (SELECT group_concat(t.name, '') FROM memoria_entry_tags et
              JOIN memoria_tags t ON t.id = et.tag_id WHERE et.entry_id = e.id) AS tagstr
    FROM memoria_entries e`);
  const map = new Map();
  for (const r of res.rows) {
    map.set(Number(r.id), {
      id: Number(r.id),
      content: r.content ?? "",
      source_type: r.source_type ?? "thought",
      source_title: r.source_title,
      source_author: r.source_author,
      source_url: r.source_url,
      source_location: r.source_location,
      my_note: r.my_note,
      is_favorite: Number(r.is_favorite ?? 0),
      is_archived: Number(r.is_archived ?? 0),
      created_at: r.created_at,
      updated_at: r.updated_at,
      captured_at: r.captured_at,
      tags: r.tagstr ? String(r.tagstr).split("") : [],
    });
  }
  return map;
}

async function ensureTagIds(tagNames) {
  const ids = [];
  for (const name of tagNames) {
    const found = await db.execute({ sql: "SELECT id FROM memoria_tags WHERE name = ?", args: [name] });
    if (found.rows.length) {
      ids.push(Number(found.rows[0].id));
    } else {
      const ins = await db.execute({ sql: "INSERT INTO memoria_tags (name) VALUES (?)", args: [name] });
      ids.push(Number(ins.lastInsertRowid));
    }
  }
  return ids;
}

async function setTags(entryId, tagNames) {
  await db.execute({ sql: "DELETE FROM memoria_entry_tags WHERE entry_id = ?", args: [entryId] });
  const ids = await ensureTagIds(tagNames);
  for (const tagId of ids) {
    await db.execute({
      sql: "INSERT INTO memoria_entry_tags (entry_id, tag_id) VALUES (?, ?)",
      args: [entryId, tagId],
    });
  }
}

async function main() {
  console.log(`[vault→memoria] VAULT=${VAULT} DRY_RUN=${DRY_RUN}`);
  const dbRows = await loadDbRows();
  const files = fs.readdirSync(ENTRIES_DIR).filter((f) => f.endsWith(".md"));
  console.log(`Vault files: ${files.length} | DB rows: ${dbRows.size}`);

  const seenIds = new Set();
  let inserted = 0, updated = 0, unchanged = 0;

  for (const fname of files) {
    const fpath = path.join(ENTRIES_DIR, fname);
    const file = parseEntryFile(fs.readFileSync(fpath, "utf8"));

    if (file.id == null) {
      // New note authored in Obsidian → insert, then stamp id back.
      const created = file.created_at || nowIso();
      if (DRY_RUN) { console.log(`  INSERT (new) ${fname}`); inserted++; continue; }
      const ins = await db.execute({
        sql: `INSERT INTO memoria_entries
              (content, source_type, source_title, source_author, source_url,
               source_location, my_note, is_favorite, is_archived, created_at, updated_at, captured_at)
              VALUES (?,?,?,?,?,?,?,?,0,?,?,?)`,
        args: [file.content, file.source_type, file.source_title, file.source_author,
               file.source_url, file.source_location, file.my_note, file.is_favorite,
               created, nowIso(), file.captured_at || created],
      });
      const newId = Number(ins.lastInsertRowid);
      await setTags(newId, file.tags);
      fs.writeFileSync(fpath, serializeEntryFile({ ...file, id: newId, created_at: created }), "utf8");
      seenIds.add(newId);
      inserted++;
      console.log(`  INSERT #${newId} ${fname}`);
      continue;
    }

    seenIds.add(file.id);
    const dbRow = dbRows.get(file.id);
    if (!dbRow) {
      // Has an id but no matching row (e.g. row was hard-deleted). Re-insert with explicit id.
      if (DRY_RUN) { console.log(`  RE-INSERT #${file.id} ${fname}`); inserted++; continue; }
      await db.execute({
        sql: `INSERT INTO memoria_entries
              (id, content, source_type, source_title, source_author, source_url,
               source_location, my_note, is_favorite, is_archived, created_at, updated_at, captured_at)
              VALUES (?,?,?,?,?,?,?,?,0,?,?,?)`,
        args: [file.id, file.content, file.source_type, file.source_title, file.source_author,
               file.source_url, file.source_location, file.my_note, file.is_favorite,
               file.created_at || nowIso(), nowIso(), file.captured_at],
      });
      await setTags(file.id, file.tags);
      inserted++;
      continue;
    }

    if (rowDirty(file, dbRow)) {
      if (DRY_RUN) { console.log(`  UPDATE #${file.id} ${fname}`); updated++; continue; }
      await db.execute({
        sql: `UPDATE memoria_entries SET content=?, source_type=?, source_title=?,
              source_author=?, source_url=?, source_location=?, my_note=?,
              is_favorite=?, is_archived=0, updated_at=? WHERE id=?`,
        args: [file.content, file.source_type, file.source_title, file.source_author,
               file.source_url, file.source_location, file.my_note, file.is_favorite,
               nowIso(), file.id],
      });
      await setTags(file.id, file.tags);
      updated++;
      console.log(`  UPDATE #${file.id} ${fname}`);
    } else {
      unchanged++;
    }
  }

  // Soft-archive rows that no longer have a vault file.
  let archived = 0;
  for (const [id, row] of dbRows) {
    if (!seenIds.has(id) && row.is_archived === 0) {
      if (DRY_RUN) { console.log(`  ARCHIVE #${id} (no vault file)`); archived++; continue; }
      await db.execute({ sql: "UPDATE memoria_entries SET is_archived=1, updated_at=? WHERE id=?", args: [nowIso(), id] });
      archived++;
    }
  }

  console.log(`\nDone. inserted=${inserted} updated=${updated} unchanged=${unchanged} archived=${archived}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-run against the current vault (should be all unchanged)**

```bash
cd /root/.openclaw/workspace/projects/claudius-hq
set -a; . ./.env.local; set +a
npx tsx scripts/import-vault-to-memoria.ts --dry-run
```
Expected: `inserted=0 updated=0 unchanged=511 archived=0` (the vault was exported FROM Turso, so nothing should differ).

- [ ] **Step 3: Round-trip test — create a new note in Obsidian style, import, verify stamp**

```bash
cat > /root/memoria-vault/Entries/zzz-roundtrip-test.md <<'EOF'
---
source_type: thought
tags: [test]
---

Round-trip smoke test entry.
EOF
set -a; . ./.env.local; set +a
npx tsx scripts/import-vault-to-memoria.ts
grep memoria-id /root/memoria-vault/Entries/zzz-roundtrip-test.md
```
Expected: import reports `inserted=1`, and the file now contains a `memoria-id: <N>` line.

- [ ] **Step 4: Clean up the smoke-test row and file**

```bash
set -a; . ./.env.local; set +a
ID=$(grep -oP 'memoria-id: \K\d+' /root/memoria-vault/Entries/zzz-roundtrip-test.md)
node -e "const {createClient}=require('@libsql/client');const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute({sql:'DELETE FROM memoria_entry_tags WHERE entry_id=?',args:[$ID]}).then(()=>db.execute({sql:'DELETE FROM memoria_entries WHERE id=?',args:[$ID]})).then(()=>console.log('deleted',$ID));"
rm /root/memoria-vault/Entries/zzz-roundtrip-test.md
```

- [ ] **Step 5: Commit**

```bash
git add scripts/import-vault-to-memoria.ts
git commit -m "feat(memoria): vault→Turso importer with id-stamping and soft-archive"
```

### Task 1.4: Importer cron wrapper

**Files:** Create: `/root/.openclaw/workspace/scripts/import-vault-to-memoria.sh`

- [ ] **Step 1: Write the wrapper**

```bash
#!/usr/bin/env bash
set -euo pipefail

HQ_DIR="/root/.openclaw/workspace/projects/claudius-hq"
VAULT="/root/memoria-vault"

set -a
source "${HQ_DIR}/.env.local"
set +a

echo "[$(date -Iseconds)] vault→memoria import starting"

# Pull the latest edits the user made in Obsidian.
git -C "$VAULT" pull --ff-only origin master

cd "$HQ_DIR"
/usr/bin/npx --yes tsx scripts/import-vault-to-memoria.ts --vault "$VAULT"

# Push back any memoria-id stamps the importer wrote into new files.
if [ -n "$(git -C "$VAULT" status --porcelain Entries/)" ]; then
  git -C "$VAULT" add Entries/
  git -C "$VAULT" commit -m "chore: stamp memoria-id on new entries [auto]"
  git -C "$VAULT" push origin master
fi

echo "[$(date -Iseconds)] vault→memoria import complete"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x /root/.openclaw/workspace/scripts/import-vault-to-memoria.sh
```

- [ ] **Step 3: Test the wrapper end-to-end**

```bash
/root/.openclaw/workspace/scripts/import-vault-to-memoria.sh
```
Expected: pulls (or "Already up to date"), reports `unchanged=511`, no push (nothing stamped).

---

## Phase 2 — HQ becomes read-only for the canonical layer

### Task 2.1: Disable entry creation API

**Files:** Modify: `src/app/api/memoria/route.ts` (`POST`, line 106)

- [ ] **Step 1: Replace the POST body with a 410 Gone**

Replace the entire `export async function POST(...) { ... }` block with:

```ts
export async function POST() {
  return NextResponse.json(
    { error: "Memoria is now authored in the Obsidian vault. Add entries there; they sync to HQ nightly." },
    { status: 410 }
  );
}
```
(Keep the existing `NextResponse` import; remove now-unused imports flagged by the linter in Step 3.)

- [ ] **Step 2: Remove the Add-Entry UI**

In `src/app/memoria/_components/MemoriaHeader.tsx`, remove the "Add Entry" button and its `AddEntryModal` usage/state. Then delete the component file:

```bash
rm src/app/memoria/_components/AddEntryModal.tsx
```

- [ ] **Step 3: Verify build + lint**

```bash
npm run typecheck && npm run lint
```
Expected: passes (fix any unused-import errors surfaced in `route.ts` / `MemoriaHeader.tsx`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/memoria/route.ts src/app/memoria/_components/MemoriaHeader.tsx
git rm src/app/memoria/_components/AddEntryModal.tsx
git commit -m "feat(memoria): make HQ read-only; entries authored in vault"
```

---

## Phase 3 — Delete the graph + wiki (Obsidian replaces them)

### Task 3.1: Delete graph & wiki pages, APIs, components

**Files:** Delete (see list).

- [ ] **Step 1: Remove pages, APIs, components, and dead scripts**

```bash
cd /root/.openclaw/workspace/projects/claudius-hq
git rm -r src/app/memoria/graph src/app/memoria/wiki
git rm -r src/app/api/memoria/wiki src/app/api/memoria/graph-qa src/app/api/memoria/mnemon/graph
git rm src/app/memoria/_components/GraphQAPanel.tsx
git rm scripts/generate-wiki-pages.ts scripts/sync-mnemon-to-hq.ts
```

- [ ] **Step 2: Remove graph/wiki tabs from nav**

In `src/app/memoria/_components/MemoriaHeader.tsx`, delete the tab logic at line ~32 and the two `<Link href="/memoria/graph">` / `href="/memoria/wiki">` blocks (lines ~57, ~68). Leave only the entries view.

- [ ] **Step 3: Find and remove remaining references**

```bash
grep -rn "memoria/graph\|memoria/wiki\|GraphQAPanel\|generate-wiki\|sync-mnemon-to-hq\|mnemonGraphSnapshots\|memoriaWikiPages" src/ scripts/
```
Expected after edits: only matches in `src/db/schema.ts` (handled in Step 4). Fix any stray imports.

- [ ] **Step 4: Remove the now-unused schema exports**

In `src/db/schema.ts`, delete the `memoriaWikiPages` table+types block (lines ~783–795) and the `mnemonGraphSnapshots` block (lines ~801–810). **Do NOT drop the Turso tables yet** — leaving them is harmless; dropping is an optional later cleanup once you're confident.

- [ ] **Step 5: Verify build + lint + tests**

```bash
npm run typecheck && npm run lint && npm run test:run
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(memoria): remove graph + wiki (replaced by Obsidian)"
```

### Task 3.2: Remove the graph-feeding cron

**Files:** Delete: `/root/.openclaw/workspace/scripts/sync-mnemon-to-hq.sh`

- [ ] **Step 1: Delete the script**

```bash
rm /root/.openclaw/workspace/scripts/sync-mnemon-to-hq.sh
```

- [ ] **Step 2: Remove its crontab line** (handled together with the new jobs in Task 4.3).

---

## Phase 4 — mnemon → vault/Mnemon mirror (read-only)

### Task 4.1: Pure mnemon→markdown module (TDD)

**Files:**
- Create: `src/lib/memoria/mnemon-vault.ts`
- Test: `src/lib/memoria/__tests__/mnemon-vault.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/memoria/__tests__/mnemon-vault.test.ts
import { describe, it, expect } from "vitest";
import { insightFilename, insightToMarkdown, type Insight, type EdgeLink } from "../mnemon-vault";

const INSIGHT: Insight = {
  id: "bd7676ae-c37e-4cd7-b944-7d312f1502f8",
  content: "Encrypted backup of mnemon SQLite DB runs daily at 03:15.",
  category: "decision",
  importance: 5,
  effective_importance: 0.9,
  source: "agent",
  tags: ["backup", "ops"],
  entities: ["DB", "memoria-id:42"],
  created_at: "2026-05-18 05:51:25",
  updated_at: "2026-05-18 05:51:25",
};

describe("insightFilename", () => {
  it("prefixes a short id and slugifies the content", () => {
    expect(insightFilename(INSIGHT)).toBe("bd7676ae-encrypted-backup-of-mnemon-sqlite-db-runs-daily-at.md");
  });
});

describe("insightToMarkdown", () => {
  const links: EdgeLink[] = [
    { type: "entity", weight: 1, targetFile: "abc12345-other-note", targetTitle: "Other note" },
  ];
  const md = insightToMarkdown(INSIGHT, links, new Map([[42, "42-the-entry-title"]]));

  it("writes frontmatter with mnemon-id and category", () => {
    expect(md).toMatch(/mnemon-id: bd7676ae-c37e-4cd7-b944-7d312f1502f8/);
    expect(md).toMatch(/category: decision/);
  });
  it("renders the body content", () => {
    expect(md).toContain("Encrypted backup of mnemon SQLite DB runs daily");
  });
  it("renders edges as wikilinks grouped under Related", () => {
    expect(md).toMatch(/## Related/);
    expect(md).toContain("[[abc12345-other-note|Other note]]");
  });
  it("links memoria-id entities back to the Entries folder", () => {
    expect(md).toContain("[[../Entries/42-the-entry-title|Source entry #42]]");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/memoria/__tests__/mnemon-vault.test.ts`
Expected: FAIL — cannot find module `../mnemon-vault`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/memoria/mnemon-vault.ts
export interface Insight {
  id: string;
  content: string;
  category: string;
  importance: number;
  effective_importance: number;
  source: string;
  tags: string[];
  entities: string[];
  created_at: string;
  updated_at: string;
}

export interface EdgeLink {
  type: "temporal" | "semantic" | "causal" | "entity";
  weight: number;
  targetFile: string;
  targetTitle: string;
}

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function insightTitle(i: Insight): string {
  return i.content.trim().split(/\s+/).slice(0, 10).join(" ");
}

export function insightFilename(i: Insight): string {
  const shortId = i.id.slice(0, 8);
  return `${shortId}-${slugify(insightTitle(i))}.md`;
}

function yamlList(items: string[]): string {
  return `[${items.map((t) => (/[:#\[\]{},]/.test(t) ? `"${t.replace(/"/g, '\\"')}"` : t)).join(", ")}]`;
}

function dateOnly(s: string): string {
  const m = String(s || "").match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

export function insightToMarkdown(
  i: Insight,
  links: EdgeLink[],
  entryTitlesById: Map<number, string>
): string {
  const fm: string[] = [];
  fm.push(`mnemon-id: ${i.id}`);
  fm.push(`category: ${i.category}`);
  fm.push(`importance: ${i.importance}`);
  fm.push(`effective_importance: ${i.effective_importance}`);
  fm.push(`source: ${i.source}`);
  if (i.tags.length) fm.push(`tags: ${yamlList(i.tags)}`);
  if (i.entities.length) fm.push(`entities: ${yamlList(i.entities)}`);
  if (dateOnly(i.created_at)) fm.push(`created: ${dateOnly(i.created_at)}`);
  if (dateOnly(i.updated_at)) fm.push(`updated: ${dateOnly(i.updated_at)}`);

  let body = `---\n${fm.join("\n")}\n---\n\n${i.content.trim()}\n`;

  // Cross-links to source Memoria entries via memoria-id:N entities.
  const entryLinks: string[] = [];
  for (const e of i.entities) {
    const m = e.match(/^memoria-id:(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      const title = entryTitlesById.get(id);
      if (title) entryLinks.push(`- [[../Entries/${title}|Source entry #${id}]]`);
    }
  }
  if (entryLinks.length) {
    body += `\n## Source\n\n${entryLinks.join("\n")}\n`;
  }

  if (links.length) {
    body += `\n## Related\n\n`;
    const byType: Record<string, EdgeLink[]> = {};
    for (const l of links) (byType[l.type] ||= []).push(l);
    for (const type of Object.keys(byType).sort()) {
      body += `**${type}**\n`;
      for (const l of byType[type].sort((a, b) => b.weight - a.weight)) {
        body += `- [[${l.targetFile}|${l.targetTitle}]]\n`;
      }
      body += `\n`;
    }
  }
  return body;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/memoria/__tests__/mnemon-vault.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/memoria/mnemon-vault.ts src/lib/memoria/__tests__/mnemon-vault.test.ts
git commit -m "feat(memoria): pure mnemon insight→markdown + edges→wikilinks module"
```

### Task 4.2: mnemon exporter CLI

**Files:** Create: `scripts/export-mnemon-to-vault.ts`

- [ ] **Step 1: Write the exporter**

```ts
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
const VAULT = path.resolve(vaultArg >= 0 ? argv[vaultArg + 1] : path.join(process.cwd(), "..", "memoria-vault"));
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

  // Wipe + regenerate (read-only mirror).
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
```

- [ ] **Step 2: Dry-run**

```bash
cd /root/.openclaw/workspace/projects/claudius-hq
npx tsx scripts/export-mnemon-to-vault.ts --dry-run
```
Expected: prints insight/edge counts (~534 insights, ~10624 edges), writes nothing.

- [ ] **Step 3: Real run + spot-check**

```bash
npx tsx scripts/export-mnemon-to-vault.ts
ls /root/memoria-vault/Mnemon/*.md | wc -l   # ~534
grep -l "## Related" /root/memoria-vault/Mnemon/*.md | head -1 | xargs head -30
```
Expected: ~534 files; a sample shows frontmatter + `## Related` with `[[wikilinks]]`.

- [ ] **Step 4: Commit (HQ repo)**

```bash
git add scripts/export-mnemon-to-vault.ts
git commit -m "feat(memoria): mnemon→vault read-only mirror exporter"
```

### Task 4.3: mnemon exporter cron wrapper + crontab rewiring

**Files:** Create: `/root/.openclaw/workspace/scripts/export-mnemon-to-vault.sh`; Modify: crontab.

- [ ] **Step 1: Write the wrapper**

```bash
#!/usr/bin/env bash
set -euo pipefail

HQ_DIR="/root/.openclaw/workspace/projects/claudius-hq"
VAULT="/root/memoria-vault"

echo "[$(date -Iseconds)] mnemon→vault mirror starting"
cd "$HQ_DIR"
/usr/bin/npx --yes tsx scripts/export-mnemon-to-vault.ts --vault "$VAULT"

if [ -n "$(git -C "$VAULT" status --porcelain Mnemon/)" ]; then
  git -C "$VAULT" add Mnemon/
  git -C "$VAULT" commit -m "chore: refresh mnemon mirror [auto]"
  git -C "$VAULT" push origin master
fi
echo "[$(date -Iseconds)] mnemon→vault mirror complete"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x /root/.openclaw/workspace/scripts/export-mnemon-to-vault.sh
```

- [ ] **Step 3: Rewire crontab** — add importer (before the existing memoria→mnemon job) and the mirror (after it); remove the deleted graph-snapshot job.

Run `crontab -e` and set the Memoria block to (ordering matters — vault→Turso→mnemon→vault/Mnemon):

```cron
25 23 * * * /root/.openclaw/workspace/scripts/import-vault-to-memoria.sh >> /var/log/vault-to-memoria.log 2>&1
35 23 * * * /root/.openclaw/workspace/scripts/sync-memoria-to-mnemon.sh >> /var/log/memoria-to-mnemon.log 2>&1
45 23 * * * /root/.openclaw/workspace/scripts/export-mnemon-to-vault.sh >> /var/log/mnemon-to-vault.log 2>&1
50 23 * * * /root/.openclaw/workspace/scripts/backup-mnemon.sh >> /var/log/mnemon-backup.log 2>&1
```
Delete the old `55 23 * * * .../sync-mnemon-to-hq.sh` line.

- [ ] **Step 4: Verify crontab**

```bash
crontab -l | grep -E "vault-to-memoria|memoria-to-mnemon|mnemon-to-vault|mnemon-backup|sync-mnemon-to-hq"
```
Expected: the 4 jobs above present; `sync-mnemon-to-hq` absent.

- [ ] **Step 5: Commit cron wrappers (workspace repo)**

```bash
cd /root/.openclaw/workspace
git add scripts/import-vault-to-memoria.sh scripts/export-mnemon-to-vault.sh
git rm scripts/sync-mnemon-to-hq.sh
git commit -m "feat(memoria): vault import + mnemon mirror crons; drop graph-snapshot sync"
```

- [ ] **Step 6: Commit the generated mirror (vault repo)**

```bash
cd /root/memoria-vault
git add Mnemon/ && git commit -m "chore: initial mnemon mirror" && git push
```

---

## Phase 5 (Optional) — Claude brain layer in the vault

Surface Claude's own markdown brain so you can browse it in Obsidian. **Optional and lower-value; do only if you actually want it.** Read-only mirror, same discipline as `Mnemon/`.

### Task 5.1: Mirror auto-memory + skills into `Claude/`

**Files:** Create: `/root/.openclaw/workspace/scripts/export-claude-brain-to-vault.sh`

- [ ] **Step 1: Write the wrapper** (copy, don't symlink — symlinks don't survive git sync)

```bash
#!/usr/bin/env bash
set -euo pipefail
VAULT="/root/memoria-vault"
MEM_SRC="/root/.claude/projects/-root--openclaw-workspace/memory"
DEST="${VAULT}/Claude"

echo "[$(date -Iseconds)] claude-brain→vault starting"
rm -rf "${DEST}/Memory"; mkdir -p "${DEST}/Memory"
cp -a "${MEM_SRC}/." "${DEST}/Memory/" 2>/dev/null || true
printf "# Claude Brain (generated, read-only)\n\nMirror of Claude's auto-memory. Edits here do nothing.\n" > "${DEST}/README.md"

if [ -n "$(git -C "$VAULT" status --porcelain Claude/)" ]; then
  git -C "$VAULT" add Claude/
  git -C "$VAULT" commit -m "chore: refresh claude brain mirror [auto]"
  git -C "$VAULT" push origin master
fi
echo "[$(date -Iseconds)] claude-brain→vault complete"
```

- [ ] **Step 2: Make executable, run once, verify**

```bash
chmod +x /root/.openclaw/workspace/scripts/export-claude-brain-to-vault.sh
/root/.openclaw/workspace/scripts/export-claude-brain-to-vault.sh
ls /root/memoria-vault/Claude/Memory/
```
Expected: `MEMORY.md` and the memory `.md` files appear.

- [ ] **Step 3: Add a nightly cron line**

```cron
40 23 * * * /root/.openclaw/workspace/scripts/export-claude-brain-to-vault.sh >> /var/log/claude-brain-to-vault.log 2>&1
```

- [ ] **Step 4: Commit wrapper (workspace repo)**

```bash
cd /root/.openclaw/workspace
git add scripts/export-claude-brain-to-vault.sh
git commit -m "feat(vault): optional Claude auto-memory mirror"
```

> **Skills/agents mirror:** if you also want skills viewable, extend the wrapper to `cp` the `SKILL.md` files from skill dirs into `Claude/Skills/`. Left out by default — skills are already easy to read in their source tree, and copying the whole skill ecosystem adds noise.

---

## Final Verification

- [ ] **Importer is idempotent:** run `import-vault-to-memoria.sh` twice; second run reports `unchanged=511 inserted=0 updated=0 archived=0`.
- [ ] **Edit round-trips:** change a line in an `Entries/*.md`, run the importer, confirm the Turso row's `content` and `updated_at` changed (query via libsql), and HQ `/memoria` shows the edit.
- [ ] **HQ is read-only:** `curl -X POST https://<hq>/api/memoria` returns `410`.
- [ ] **Graph/wiki gone:** `/memoria/graph` and `/memoria/wiki` 404; nav shows only entries.
- [ ] **mnemon mirror populated:** `Mnemon/` has ~534 notes; Obsidian graph view shows them interlinked; a `memoria-id:N` insight links into `../Entries/`.
- [ ] **Cron order correct:** `crontab -l` shows 23:25 → 23:35 → 23:45 → 23:50 (→ 23:40 brain if Phase 5).
- [ ] **Privacy:** `gh repo view memoria-vault -q .visibility` is `private`.
- [ ] **HQ checks pass:** `npm run typecheck && npm run lint && npm run test:run`.

---

## Notes / Decisions Baked In

- **Turso is kept as HQ's cache**, fed by the importer — HQ read code is unchanged, minimizing blast radius.
- **Soft-archive, never hard-delete** on missing vault files (`is_archived=1`) — reversible.
- **Wiki/graph Turso tables are left in place** after code removal; dropping them is an optional later migration, not required.
- **mnemon stays the agent's hot memory path** (auto-recall hook, decay, embeddings). The vault mirror is for human viewing only — strictly one-way.
- **Vault repo must be private** — it contains memory about the user (same reason mnemon's backup is encrypted).
