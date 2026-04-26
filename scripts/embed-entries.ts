/**
 * Backfill embeddings for all Memoria entries using Gemini's gemini-embedding-001.
 *
 * Usage: npx tsx scripts/embed-entries.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_AUTH = process.env.TURSO_AUTH_TOKEN!;

if (!GEMINI_API_KEY || !TURSO_URL) {
  console.error("Missing GEMINI_API_KEY or TURSO_DATABASE_URL in .env.local");
  process.exit(1);
}

const client = createClient({ url: TURSO_URL, authToken: TURSO_AUTH });

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
const BATCH_SIZE = 20;
const DELAY_MS = 100;

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: text.slice(0, 2000) }] },
      outputDimensionality: 256,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.embedding.values;
}

function toBuffer(values: number[]): Buffer {
  const arr = new Float32Array(values);
  return Buffer.from(arr.buffer);
}

async function main() {
  // Add column if not exists
  try {
    await client.execute("ALTER TABLE memoria_entries ADD COLUMN content_embedding BLOB");
    console.log("Added content_embedding column");
  } catch {
    console.log("content_embedding column already exists");
  }

  // Fetch entries without embeddings
  const { rows } = await client.execute(
    "SELECT id, content FROM memoria_entries WHERE content_embedding IS NULL ORDER BY id"
  );

  console.log(`Found ${rows.length} entries to embed`);

  let processed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      try {
        const values = await embedText(row.content as string);
        const buf = toBuffer(values);
        await client.execute({
          sql: "UPDATE memoria_entries SET content_embedding = ? WHERE id = ?",
          args: [buf, row.id],
        });
        processed++;
      } catch (err) {
        console.error(`Failed to embed entry ${row.id}:`, err);
      }
    }

    if (processed % 50 < BATCH_SIZE) {
      console.log(`Progress: ${processed}/${rows.length}`);
    }

    if (i + BATCH_SIZE < rows.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`Done. Embedded ${processed}/${rows.length} entries.`);
}

main().catch(console.error);
