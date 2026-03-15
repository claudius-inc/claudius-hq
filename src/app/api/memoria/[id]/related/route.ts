import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import { db, memoriaEntries, memoriaEntryTags, memoriaTags } from "@/db";
import { eq, ne, and, inArray, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

// GET /api/memoria/[id]/related — Find related entries by tag overlap + ai_tags keyword overlap
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!checkApiAuth(req)) return unauthorizedResponse();
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    // Get the source entry
    const [entry] = await db.select().from(memoriaEntries).where(eq(memoriaEntries.id, id));
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Score map: entryId -> relevance score
    const scores = new Map<number, number>();

    // 1) Shared user tags (strongest signal — explicit curation)
    const entryTagIds = await db
      .select({ tagId: memoriaEntryTags.tagId })
      .from(memoriaEntryTags)
      .where(eq(memoriaEntryTags.entryId, id));

    if (entryTagIds.length > 0) {
      const tagIds = entryTagIds.map((t) => t.tagId);
      const sharedTagEntries = await db
        .select({ entryId: memoriaEntryTags.entryId })
        .from(memoriaEntryTags)
        .where(
          and(
            inArray(memoriaEntryTags.tagId, tagIds),
            ne(memoriaEntryTags.entryId, id)
          )
        );

      for (const row of sharedTagEntries) {
        scores.set(row.entryId, (scores.get(row.entryId) || 0) + 3);
      }
    }

    // 2) AI tag keyword overlap
    if (entry.aiTags) {
      let sourceTags: string[] = [];
      try {
        sourceTags = JSON.parse(entry.aiTags);
      } catch { /* ignore parse errors */ }

      if (sourceTags.length > 0) {
        // Get all other non-archived entries that have ai_tags
        const others = await db
          .select({ id: memoriaEntries.id, aiTags: memoriaEntries.aiTags })
          .from(memoriaEntries)
          .where(and(ne(memoriaEntries.id, id), eq(memoriaEntries.isArchived, 0)));

        for (const other of others) {
          if (!other.aiTags) continue;
          let otherTags: string[] = [];
          try {
            otherTags = JSON.parse(other.aiTags);
          } catch { continue; }

          const overlap = sourceTags.filter((t) =>
            otherTags.some((ot) => ot === t || ot.includes(t) || t.includes(ot))
          ).length;

          if (overlap > 0) {
            scores.set(other.id, (scores.get(other.id) || 0) + overlap);
          }
        }
      }
    }

    // 3) Same source title (weaker signal but useful)
    if (entry.sourceTitle) {
      const sameSource = await db
        .select({ id: memoriaEntries.id })
        .from(memoriaEntries)
        .where(
          and(
            eq(memoriaEntries.sourceTitle, entry.sourceTitle),
            ne(memoriaEntries.id, id),
            eq(memoriaEntries.isArchived, 0)
          )
        );

      for (const row of sameSource) {
        scores.set(row.id, (scores.get(row.id) || 0) + 1);
      }
    }

    if (scores.size === 0) {
      return NextResponse.json({ related: [] });
    }

    // Sort by score desc, take top 5
    const topIds = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([entryId]) => entryId);

    const related = await db
      .select()
      .from(memoriaEntries)
      .where(inArray(memoriaEntries.id, topIds));

    // Preserve score ordering
    const ordered = topIds
      .map((eid) => related.find((r) => r.id === eid))
      .filter(Boolean);

    return NextResponse.json({ related: ordered });
  } catch (e) {
    logger.error("api/memoria/related", "Failed to find related entries", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
