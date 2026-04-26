import { createClient } from '@libsql/client';
const c = createClient({ url: 'libsql://claudius-hq-manapixels.aws-ap-northeast-1.turso.io', authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Njk5MDQxMjMsImlkIjoiZGQ1ZTcxODMtODM0Mi00NmZhLTk5YTItN2U3OWRmZjJjYjM0IiwicmlkIjoiMGEyZTM1YmYtMDJiZi00ZmYzLTkzNDktYzk0OTgzMDI1OTkzIn0.ztrDyGsVoUGyoBzlng_EbAIAKF_oYuW76pZf8uKOykjSXr5mm7qPHMI0-vGRSmvPR67aDPoomzX4__XRsdBCDA' });
const r = await c.execute(`SELECT id, content, source_type, source_title, source_author, ai_tags FROM memoria_entries me WHERE me.is_archived = 0 AND (SELECT COUNT(*) FROM memoria_entry_tags met WHERE met.entry_id = me.id) = 0`);
console.log('Untagged entries:', r.rows.length);
for (const row of r.rows) {
  console.log(JSON.stringify({ id: row.id, type: row.source_type, title: row.source_title, author: row.source_author, tags: row.ai_tags, content: (row.content as string)?.slice(0, 100) }));
}
