import { createClient } from "@libsql/client";
import { promises as fs } from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  // Create table if not exists
  await db.execute(`
    CREATE TABLE IF NOT EXISTS research_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, slug)
    )
  `);

  const directory = "/root/openclaw/nakodo/wiki";
  const projectId = 7; // Nakodo

  const files = await fs.readdir(directory);
  const mdFiles = files.filter((f: string) => f.endsWith(".md")).sort();

  console.log(`Found ${mdFiles.length} markdown files`);

  for (const file of mdFiles) {
    const content = await fs.readFile(path.join(directory, file), "utf-8");

    const baseName = file.replace(/\.md$/, "");
    const sortMatch = baseName.match(/^(\d+)-(.+)$/);
    const sortOrder = sortMatch ? parseInt(sortMatch[1], 10) : 0;
    const slug = sortMatch ? sortMatch[2] : baseName;

    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;

    await db.execute({
      sql: `INSERT INTO research_pages (project_id, slug, title, content, sort_order)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(project_id, slug) DO UPDATE SET
              title = excluded.title,
              content = excluded.content,
              sort_order = excluded.sort_order,
              updated_at = datetime('now')`,
      args: [projectId, slug, title, content, sortOrder],
    });

    console.log(`  ✓ ${slug}: ${title}`);
  }

  console.log(`\nDone! Imported ${mdFiles.length} research pages for project ${projectId}`);
}

main().catch(console.error);
