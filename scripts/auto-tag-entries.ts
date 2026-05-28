#!/usr/bin/env tsx
// @ts-nocheck
/**
 * auto-tag-entries.ts
 * Finds vault entries (Entries/ + Notion/) with no tags and assigns 1-4 topical tags
 * via Gemini, constrained to the existing tag vocabulary (only inventing a tag when
 * nothing fits). Writes tags into the file's frontmatter — the importer then carries
 * them to Turso, and mnemon re-syncs them. One-way producer into the canonical vault.
 *
 * Usage (from claudius-hq root):
 *   set -a; . ./.env.local; set +a
 *   npx tsx scripts/auto-tag-entries.ts [--vault DIR] [--limit N] [--dry-run]
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@libsql/client");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const vIdx = argv.indexOf("--vault");
const lIdx = argv.indexOf("--limit");
const VAULT = path.resolve(vIdx >= 0 ? argv[vIdx + 1] : "/root/memoria-vault");
const LIMIT = lIdx >= 0 ? parseInt(argv[lIdx + 1], 10) : Infinity;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

function listFiles() {
  const out = [];
  for (const d of [path.join(VAULT, "Entries"), path.join(VAULT, "Synced", "Notion")]) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (f.endsWith(".md")) out.push(path.join(d, f));
  }
  return out;
}

function isUntagged(data) {
  return !Array.isArray(data.tags) || data.tags.length === 0;
}

async function existingVocab() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const r = await db.execute("SELECT name FROM memoria_tags ORDER BY name");
  return r.rows.map((x) => x.name);
}

async function suggestTags(title, body, vocab) {
  const prompt = `You tag notes in a personal knowledge base. Return 1-4 topical tags for the note below.
STRONGLY prefer reusing these existing tags (only invent a new one if none fit):
${vocab.join(", ")}

Rules: tags lowercase, hyphenated, single concept (e.g. "risk-management"). No generic tags like "notes" or "misc".
Return ONLY a JSON array of strings, nothing else.

Title: ${title || "(none)"}
Content:
${(body || "").slice(0, 4000)}`;
  const res = await model.generateContent(prompt);
  const text = res.response.text().trim();
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return [...new Set(arr.map((t) => String(t).toLowerCase().trim().replace(/\s+/g, "-")).filter(Boolean))].slice(0, 4);
  } catch {
    return [];
  }
}

async function main() {
  console.log(`[auto-tag] VAULT=${VAULT} DRY_RUN=${DRY_RUN} LIMIT=${LIMIT}`);
  const vocab = await existingVocab();
  console.log(`Existing vocab: ${vocab.length} tags`);

  const files = listFiles();
  let tagged = 0, scanned = 0;
  for (const fpath of files) {
    if (tagged >= LIMIT) break;
    const raw = fs.readFileSync(fpath, "utf8");
    const parsed = matter(raw);
    if (!isUntagged(parsed.data)) continue;
    scanned++;

    const tags = await suggestTags(parsed.data.title, parsed.content, vocab);
    if (!tags.length) {
      console.log(`  ? ${path.basename(fpath)} → (no tags returned)`);
      continue;
    }
    tagged++;
    console.log(`  + ${path.basename(fpath)} → [${tags.join(", ")}]`);
    if (!DRY_RUN) {
      parsed.data.tags = tags;
      fs.writeFileSync(fpath, matter.stringify(parsed.content, parsed.data), "utf8");
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\nDone. ${DRY_RUN ? "Would tag" : "Tagged"} ${tagged} entries (scanned ${scanned} untagged).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
