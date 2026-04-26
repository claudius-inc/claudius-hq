import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, memoriaEntries, memoriaEntryTags, memoriaTags } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const [entry] = await db.select().from(memoriaEntries).where(eq(memoriaEntries.id, id));
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const tags = await db
      .select({ id: memoriaTags.id, name: memoriaTags.name, color: memoriaTags.color })
      .from(memoriaEntryTags)
      .innerJoin(memoriaTags, eq(memoriaEntryTags.tagId, memoriaTags.id))
      .where(eq(memoriaEntryTags.entryId, id));

    return NextResponse.json({ entry: { ...entry, tags } });
  } catch (e) {
    logger.error("api/memoria", "Failed to get entry", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const body = await req.json();
    const updateData: Partial<typeof memoriaEntries.$inferInsert> = {
      updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    };

    if (body.content !== undefined) updateData.content = body.content;
    if (body.source_type !== undefined) updateData.sourceType = body.source_type;
    if (body.source_title !== undefined) updateData.sourceTitle = body.source_title;
    if (body.source_author !== undefined) updateData.sourceAuthor = body.source_author;
    if (body.source_url !== undefined) updateData.sourceUrl = body.source_url;
    if (body.source_location !== undefined) updateData.sourceLocation = body.source_location;
    if (body.my_note !== undefined) updateData.myNote = body.my_note;
    if (body.is_favorite !== undefined) updateData.isFavorite = body.is_favorite;
    if (body.is_archived !== undefined) updateData.isArchived = body.is_archived;

    await db.update(memoriaEntries).set(updateData).where(eq(memoriaEntries.id, id));

    if (body.tag_ids !== undefined && Array.isArray(body.tag_ids)) {
      await db.delete(memoriaEntryTags).where(eq(memoriaEntryTags.entryId, id));
      if (body.tag_ids.length > 0) {
        await db.insert(memoriaEntryTags).values(
          body.tag_ids.map((tagId: number) => ({ entryId: id, tagId }))
        );
      }
    }

    const [result] = await db.select().from(memoriaEntries).where(eq(memoriaEntries.id, id));
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

    revalidateTag('memoria');
    return NextResponse.json({ entry: result });
  } catch (e) {
    logger.error("api/memoria", "Failed to update entry", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const [existing] = await db.select({ id: memoriaEntries.id }).from(memoriaEntries).where(eq(memoriaEntries.id, id));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.delete(memoriaEntries).where(eq(memoriaEntries.id, id));
    revalidateTag('memoria');
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("api/memoria", "Failed to delete entry", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
