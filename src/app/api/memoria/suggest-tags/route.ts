import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { rawClient } from "@/db";
import { logger } from "@/lib/logger";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    const { content, source_type, source_title, source_author } = await req.json();

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    // Fetch existing tags
    const tagsResult = await rawClient.execute({
      sql: `SELECT id, name FROM memoria_tags ORDER BY name`,
      args: [],
    });
    const existingTags = tagsResult.rows.map((r) => r.name as string);

    const prompt = `You are a tagging assistant for a personal knowledge base called Memoria.

Given the following ${source_type || "note"}${source_title ? ` from "${source_title}"` : ""}${source_author ? ` by ${source_author}` : ""}:

---
${content.slice(0, 2000)}
---

Existing tags in the database: ${existingTags.join(", ")}

Select 1-4 relevant tags from the existing list. If none fit perfectly, suggest up to 2 new tags. New tags should be:
- lowercase, hyphenated (e.g. "behavioral-finance")
- Broad enough to be reused across multiple entries
- Not book-specific (we already filter by title/author)

Return ONLY a JSON array of tag names (strings). Example: ["investing", "risk-management", "psychology"]

Do NOT include explanation. Just the JSON array.`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Parse JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return NextResponse.json({ suggested_tags: [] });
    }

    let suggestedTags: string[] = JSON.parse(jsonMatch[0]);

    // Separate existing vs new tags
    const existingTagIds: number[] = [];
    const newTags: string[] = [];

    for (const tagName of suggestedTags) {
      const existing = tagsResult.rows.find(
        (r) => (r.name as string).toLowerCase() === tagName.toLowerCase()
      );
      if (existing) {
        existingTagIds.push(existing.id as number);
      } else {
        newTags.push(tagName.toLowerCase().trim());
      }
    }

    // Create new tags
    const createdTagIds: number[] = [];
    for (const newTag of newTags) {
      if (!newTag) continue;
      try {
        const insertResult = await rawClient.execute({
          sql: `INSERT OR IGNORE INTO memoria_tags (name) VALUES (?)`,
          args: [newTag],
        });
        const tagId = Number(insertResult.lastInsertRowid);
        if (tagId > 0) {
          createdTagIds.push(tagId);
        }
      } catch {
        // Tag might already exist, try to fetch it
        const fetchResult = await rawClient.execute({
          sql: `SELECT id FROM memoria_tags WHERE name = ?`,
          args: [newTag],
        });
        if (fetchResult.rows.length > 0) {
          createdTagIds.push(fetchResult.rows[0].id as number);
        }
      }
    }

    const allTagIds = [...existingTagIds, ...createdTagIds];

    // Fetch the full tag objects for response
    let finalTags: { id: number; name: string; color: string | null; isNew: boolean }[] = [];
    if (allTagIds.length > 0) {
      const placeholders = allTagIds.map(() => "?").join(",");
      const tagsFetch = await rawClient.execute({
        sql: `SELECT id, name, color FROM memoria_tags WHERE id IN (${placeholders})`,
        args: allTagIds,
      });
      const createdNames = new Set(newTags);
      finalTags = tagsFetch.rows.map((r) => ({
        id: r.id as number,
        name: r.name as string,
        color: r.color as string | null,
        isNew: createdNames.has(r.name as string),
      }));
    }

    return NextResponse.json({ suggested_tags: finalTags });
  } catch (e) {
    logger.error("api/memoria/suggest-tags", "Failed to suggest tags", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
