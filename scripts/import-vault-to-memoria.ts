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
const VAULT = path.resolve(vaultArg >= 0 ? argv[vaultArg + 1] : "/root/memoria-vault");

function listEntryFiles(vault) {
  const dirs = [path.join(vault, "Entries"), path.join(vault, "Synced", "Notion")];
  const files = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (f.endsWith(".md")) files.push(path.join(d, f));
  }
  return files;
}

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
  const files = listEntryFiles(VAULT);
  console.log(`Vault files: ${files.length} | DB rows: ${dbRows.size}`);

  const seenIds = new Set();
  let inserted = 0, updated = 0, unchanged = 0;

  for (const fpath of files) {
    const fname = path.basename(fpath);
    const file = parseEntryFile(fs.readFileSync(fpath, "utf8"));

    if (file.id == null) {
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
