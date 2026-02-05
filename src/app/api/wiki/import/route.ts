import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  await ensureDB();

  const body = await req.json();
  const { directory, project_id } = body;

  if (!directory || !project_id) {
    return NextResponse.json({ error: "directory and project_id are required" }, { status: 400 });
  }

  try {
    const files = await fs.readdir(directory);
    const mdFiles = files.filter((f: string) => f.endsWith(".md")).sort();

    const imported: { slug: string; title: string }[] = [];

    for (const file of mdFiles) {
      const content = await fs.readFile(path.join(directory, file), "utf-8");

      // Extract slug from filename: "00-index.md" -> "index", "01-japanese-system.md" -> "japanese-system"
      const baseName = file.replace(/\.md$/, "");
      const sortMatch = baseName.match(/^(\d+)-(.+)$/);
      const sortOrder = sortMatch ? parseInt(sortMatch[1], 10) : 0;
      const slug = sortMatch ? sortMatch[2] : baseName;

      // Extract title from first # heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : slug;

      await db.execute({
        sql: `INSERT INTO wiki_pages (project_id, slug, title, content, sort_order)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(project_id, slug) DO UPDATE SET
                title = excluded.title,
                content = excluded.content,
                sort_order = excluded.sort_order,
                updated_at = datetime('now')`,
        args: [project_id, slug, title, content, sortOrder],
      });

      imported.push({ slug, title });
    }

    return NextResponse.json({
      success: true,
      imported: imported.length,
      pages: imported,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
