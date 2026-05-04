import { createClient } from '@libsql/client';
const c = createClient({ url: 'libsql://claudius-hq-manapixels.aws-ap-northeast-1.turso.io', authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Njk5MDQxMjMsImlkIjoiZGQ1ZTcxODMtODM0Mi00NmZhLTk5YTItN2U3OWRmZjJjYjM0IiwicmlkIjoiMGEyZTM1YmYtMDJiZi00ZmYzLTkzNDktYzk0OTgzMDI1OTkzIn0.ztrDyGsVoUGyoBzlng_EbAIAKF_oYuW76pZf8uKOykjSXr5mm7qPHMI0-vGRSmvPR67aDPoomzX4__XRsdBCDA' });

// Check data completeness
const total = await c.execute("SELECT COUNT(*) as c FROM memoria_entries WHERE is_archived = 0");
console.log("Total entries:", total.rows[0].c);

const withTags = await c.execute("SELECT COUNT(*) as c FROM memoria_entries me WHERE me.is_archived = 0 AND (SELECT COUNT(*) FROM memoria_entry_tags met WHERE met.entry_id = me.id) > 0");
console.log("With tags:", withTags.rows[0].c);

const withTitle = await c.execute("SELECT COUNT(*) as c FROM memoria_entries WHERE is_archived = 0 AND source_title IS NOT NULL");
console.log("With source title:", withTitle.rows[0].c);

const withAuthor = await c.execute("SELECT COUNT(*) as c FROM memoria_entries WHERE is_archived = 0 AND source_author IS NOT NULL");
console.log("With source author:", withAuthor.rows[0].c);

const withNote = await c.execute("SELECT COUNT(*) as c FROM memoria_entries WHERE is_archived = 0 AND my_note IS NOT NULL AND my_note != ''");
console.log("With personal note:", withNote.rows[0].c);

const avgLen = await c.execute("SELECT AVG(LENGTH(content)) as avg_len FROM memoria_entries WHERE is_archived = 0");
console.log("Avg content length:", Math.round(avgLen.rows[0].avg_len as number), "chars");

const byType = await c.execute("SELECT source_type, COUNT(*) as c FROM memoria_entries WHERE is_archived = 0 GROUP BY source_type ORDER BY c DESC");
console.log("\nBy type:", byType.rows.map(r => `${r.source_type}: ${r.c}`).join(", "));

const tagCount = await c.execute("SELECT COUNT(*) as c FROM memoria_tags");
console.log("\nTotal tags:", tagCount.rows[0].c);

const tagDist = await c.execute("SELECT t.name, COUNT(met.entry_id) as c FROM memoria_tags t LEFT JOIN memoria_entry_tags met ON t.id = met.tag_id GROUP BY t.name ORDER BY c DESC LIMIT 10");
console.log("Top tags:", tagDist.rows.map(r => `${r.name}: ${r.c}`).join(", "));

// Total text size
const totalChars = await c.execute("SELECT SUM(LENGTH(content)) as t FROM memoria_entries WHERE is_archived = 0");
console.log("\nTotal content chars:", (totalChars.rows[0].t as number).toLocaleString(), "(~", Math.round((totalChars.rows[0].t as number) / 4 / 1000), "K tokens)");
