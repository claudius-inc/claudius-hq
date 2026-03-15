import { NextRequest, NextResponse } from "next/server";
import { db, memoriaEntries } from "@/db";
import { eq, sql, and, or, isNull, lt } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    const [entry] = await db
      .select()
      .from(memoriaEntries)
      .where(
        and(
          eq(memoriaEntries.isArchived, 0),
          or(
            isNull(memoriaEntries.lastSurfacedAt),
            lt(memoriaEntries.lastSurfacedAt, cutoff)
          )
        )
      )
      .orderBy(sql`RANDOM()`)
      .limit(1);

    if (!entry) {
      // Fallback: any non-archived entry
      const [fallback] = await db
        .select()
        .from(memoriaEntries)
        .where(eq(memoriaEntries.isArchived, 0))
        .orderBy(sql`RANDOM()`)
        .limit(1);

      if (!fallback) return NextResponse.json({ entry: null });

      await db
        .update(memoriaEntries)
        .set({ lastSurfacedAt: new Date().toISOString().replace("T", " ").slice(0, 19) })
        .where(eq(memoriaEntries.id, fallback.id));

      return NextResponse.json({ entry: fallback });
    }

    await db
      .update(memoriaEntries)
      .set({ lastSurfacedAt: new Date().toISOString().replace("T", " ").slice(0, 19) })
      .where(eq(memoriaEntries.id, entry.id));

    return NextResponse.json({ entry });
  } catch (e) {
    logger.error("api/memoria/random", "Failed to get random entry", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
