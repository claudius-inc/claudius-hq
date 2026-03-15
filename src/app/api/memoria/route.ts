import { NextRequest, NextResponse } from "next/server";
import { db, memoriaEntries, memoriaEntryTags, memoriaTags } from "@/db";
import { desc, eq, and, like, or, sql, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sourceType = url.searchParams.get("source_type");
    const tagId = url.searchParams.get("tag");
    const favorite = url.searchParams.get("favorite");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const perPage = parseInt(url.searchParams.get("per_page") || "50", 10);
    const offset = (page - 1) * perPage;

    const conditions = [];
    if (sourceType) conditions.push(eq(memoriaEntries.sourceType, sourceType));
    if (favorite === "1") conditions.push(eq(memoriaEntries.isFavorite, 1));
    conditions.push(eq(memoriaEntries.isArchived, 0));

    let entryIds: number[] | null = null;
    if (tagId) {
      const tagged = await db
        .select({ entryId: memoriaEntryTags.entryId })
        .from(memoriaEntryTags)
        .where(eq(memoriaEntryTags.tagId, parseInt(tagId, 10)));
      entryIds = tagged.map((t) => t.entryId);
      if (entryIds.length === 0) {
        return NextResponse.json({ entries: [], total: 0 });
      }
      conditions.push(inArray(memoriaEntries.id, entryIds));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const entries = await db
      .select()
      .from(memoriaEntries)
      .where(where)
      .orderBy(desc(memoriaEntries.createdAt))
      .limit(perPage)
      .offset(offset);

    // Fetch tags for each entry
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const tags = await db
          .select({ id: memoriaTags.id, name: memoriaTags.name, color: memoriaTags.color })
          .from(memoriaEntryTags)
          .innerJoin(memoriaTags, eq(memoriaEntryTags.tagId, memoriaTags.id))
          .where(eq(memoriaEntryTags.entryId, entry.id));
        return { ...entry, tags };
      })
    );

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(memoriaEntries)
      .where(where);

    return NextResponse.json({ entries: enriched, total: count });
  } catch (e) {
    logger.error("api/memoria", "Failed to list entries", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, source_type, source_title, source_author, source_url, source_location, my_note, tag_ids, captured_at } = body;

    if (!content || !source_type) {
      return NextResponse.json({ error: "content and source_type are required" }, { status: 400 });
    }

    const [entry] = await db
      .insert(memoriaEntries)
      .values({
        content,
        sourceType: source_type,
        sourceTitle: source_title || null,
        sourceAuthor: source_author || null,
        sourceUrl: source_url || null,
        sourceLocation: source_location || null,
        myNote: my_note || null,
        capturedAt: captured_at || null,
      })
      .returning();

    if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
      await db.insert(memoriaEntryTags).values(
        tag_ids.map((tagId: number) => ({ entryId: entry.id, tagId }))
      );
    }

    return NextResponse.json({ entry }, { status: 201 });
  } catch (e) {
    logger.error("api/memoria", "Failed to create entry", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
