import { NextRequest, NextResponse } from "next/server";
import { db, memoriaEntries } from "@/db";
import { or, like, eq, and, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const q = new URL(req.url).searchParams.get("q");
    if (!q) return NextResponse.json({ entries: [] });

    const pattern = `%${q}%`;

    const entries = await db
      .select()
      .from(memoriaEntries)
      .where(
        and(
          eq(memoriaEntries.isArchived, 0),
          or(
            like(memoriaEntries.content, pattern),
            like(memoriaEntries.sourceTitle, pattern),
            like(memoriaEntries.sourceAuthor, pattern),
            like(memoriaEntries.myNote, pattern),
            like(memoriaEntries.aiTags, pattern)
          )
        )
      )
      .orderBy(desc(memoriaEntries.createdAt))
      .limit(100);

    return NextResponse.json({ entries });
  } catch (e) {
    logger.error("api/memoria/search", "Search failed", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
