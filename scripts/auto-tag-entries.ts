import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const BATCH_SIZE = 25;

const TAXONOMY = [
  'investing', 'trading', 'psychology', 'philosophy', 'leadership',
  'singapore', 'geopolitics', 'economics', 'risk-management', 'life-lessons',
  'self-improvement', 'relationships', 'entrepreneurship', 'personal-finance',
  'mindfulness', 'china', 'japan', 'communication', 'decision-making',
  'discipline', 'wealth-building', 'behavioral-finance', 'market-history',
  'taoism', 'productivity', 'inequality', 'fiction',
];

const taxonomySet = new Set(TAXONOMY);

async function callGemini(entries: { id: number; content: string; source: string }[]): Promise<Map<number, string[]>> {
  const prompt = `You are a content categorizer. For each entry below, assign 1-3 tags from this taxonomy:
${TAXONOMY.join(', ')}

Rules:
- Only use tags from the taxonomy above
- Pick the MOST relevant tags (1-3 per entry)
- If content spans multiple themes, pick all that apply
- For book quotes about money/investing: use "investing", "behavioral-finance", "wealth-building", "risk-management"
- For LKY/Singapore content: use "singapore", "leadership", "geopolitics"
- For personal trading thoughts: use "trading", "risk-management", "market-history"
- For self-help/philosophy: use "philosophy", "psychology", "self-improvement", "life-lessons", "discipline"
- For fiction book highlights: use "fiction"

Entries:
${JSON.stringify(entries, null, 2)}

IMPORTANT: Return ONLY a JSON array. Each element must have "id" (the entry's id number) and "tags" (array of tag strings). Example: [{"id": 1, "tags": ["investing", "risk-management"]}]. No markdown, no explanation, just the JSON array.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      })
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }

  const data = await res.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('No JSON found in response:', text.slice(0, 300));
    return new Map();
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const result = new Map<number, string[]>();

  for (const item of parsed) {
    // Handle various key names Gemini might return
    const id = item.id || item.entry_id || item.entryId;
    const tags = item.tags || item.tag_names || item.tagNames || [];
    if (typeof id === 'number' && Array.isArray(tags)) {
      result.set(id, tags.filter((t: string) => taxonomySet.has(t)));
    }
  }

  return result;
}

async function main() {
  console.log('=== Memoria Auto-Tagger ===');

  // 1. Create tags
  for (const tagName of TAXONOMY) {
    await db.execute({ sql: "INSERT OR IGNORE INTO memoria_tags (name) VALUES (?)", args: [tagName] });
  }

  // Load tag name -> id mapping
  const tagRows = await db.execute('SELECT id, name FROM memoria_tags');
  const tagMap = new Map<string, number>();
  tagRows.rows.forEach(r => tagMap.set(r.name as string, r.id as number));
  console.log(`Tags in DB: ${tagMap.size}`);

  // 2. Get all untagged entries
  const { rows } = await db.execute(
    `SELECT id, content, source_type, source_title, source_author
     FROM memoria_entries
     WHERE is_archived = 0
       AND id NOT IN (SELECT DISTINCT entry_id FROM memoria_entry_tags)
     ORDER BY id`
  );
  console.log(`Untagged entries: ${rows.length}`);

  if (rows.length === 0) { console.log('Nothing to tag!'); return; }

  const entries = rows.map(r => ({
    id: r.id as number,
    content: (r.content as string)?.slice(0, 500) || '',
    source: r.source_type === 'book'
      ? `${r.source_title} by ${r.source_author}`
      : 'personal thought'
  }));

  // 3. Process in batches
  let totalInserted = 0;
  let totalTagged = 0;
  let errors = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(entries.length / BATCH_SIZE);
    console.log(`\nBatch ${batchNum}/${totalBatches} (entries ${i + 1}-${i + batch.length})`);

    try {
      const tagResults = await callGemini(batch);

      if (batchNum <= 2) {
        // Debug first batches
        console.log(`  Gemini returned ${tagResults.size} results for ${batch.length} entries`);
        for (const [id, tags] of tagResults) {
          if (id === batch[0].id || id === batch[1]?.id) {
            console.log(`  Sample: entry ${id} -> ${JSON.stringify(tags)}`);
          }
        }
      }

      // Batch insert entry_tags
      const insertValues: { entryId: number; tagId: number }[] = [];
      for (const entry of batch) {
        const tags = tagResults.get(entry.id);
        if (!tags || tags.length === 0) continue;
        totalTagged++;
        for (const tagName of tags) {
          const tagId = tagMap.get(tagName);
          if (tagId) {
            insertValues.push({ entryId: entry.id, tagId });
          }
        }
      }

      // Insert in small batches
      for (let j = 0; j < insertValues.length; j += 10) {
        const chunk = insertValues.slice(j, j + 10);
        const values = chunk.map(() => '(?, ?)').join(', ');
        const args = chunk.flatMap(v => [v.entryId, v.tagId]);
        await db.execute({
          sql: `INSERT OR IGNORE INTO memoria_entry_tags (entry_id, tag_id) VALUES ${values}`,
          args
        });
        totalInserted += chunk.length;
      }

      console.log(`  Inserted ${insertValues.length} tag links (${totalTagged} entries tagged, ${totalInserted} total links)`);

      // Rate limit
      if (i + BATCH_SIZE < entries.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e: any) {
      console.error(`  Batch ${batchNum} error: ${e.message}`);
      errors++;
      if (errors > 5) { console.error('Too many errors, stopping'); break; }
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // 4. Verify
  const { rows: countRows } = await db.execute('SELECT COUNT(*) as cnt FROM memoria_entry_tags');
  const { rows: taggedEntries } = await db.execute('SELECT COUNT(DISTINCT entry_id) as cnt FROM memoria_entry_tags');
  console.log(`\n=== Done ===`);
  console.log(`Total tag associations: ${countRows[0].cnt}`);
  console.log(`Tagged entries: ${taggedEntries[0].cnt}`);
  console.log(`Errors: ${errors}`);

  // Tag distribution
  const { rows: dist } = await db.execute(
    `SELECT t.name, COUNT(met.entry_id) as cnt FROM memoria_tags t JOIN memoria_entry_tags met ON t.id = met.tag_id GROUP BY t.id ORDER BY cnt DESC`
  );
  console.log('\nTag distribution:');
  dist.forEach(r => console.log(`  ${r.name}: ${r.cnt}`));
}

main().catch(console.error);
