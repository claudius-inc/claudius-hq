import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, memoriaEntries, memoriaInsights } from "@/db";
import { eq, desc } from "drizzle-orm";
import { analyzePatterns, analyzeConnections, analyzeDistillation } from "@/lib/gemini";
import { logger } from "@/lib/logger";

// GET /api/memoria/insights — List all insights
export async function GET(request: NextRequest) {
  try {
    const insights = await db
      .select()
      .from(memoriaInsights)
      .orderBy(desc(memoriaInsights.generatedAt));

    return NextResponse.json({ insights });
  } catch (e) {
    logger.error("api/memoria/insights", "Failed to list insights", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/memoria/insights — Generate new insights
export async function POST(req: NextRequest) {
  try {
    const { type } = await req.json();

    if (!type || !["patterns", "connections", "distillation"].includes(type)) {
      return NextResponse.json(
        { error: "type must be one of: patterns, connections, distillation" },
        { status: 400 }
      );
    }

    // Fetch all non-archived entries
    const entries = await db
      .select({
        id: memoriaEntries.id,
        content: memoriaEntries.content,
        sourceType: memoriaEntries.sourceType,
        sourceTitle: memoriaEntries.sourceTitle,
        sourceAuthor: memoriaEntries.sourceAuthor,
        myNote: memoriaEntries.myNote,
        aiTags: memoriaEntries.aiTags,
      })
      .from(memoriaEntries)
      .where(eq(memoriaEntries.isArchived, 0))
      .orderBy(desc(memoriaEntries.createdAt));

    if (entries.length < 3) {
      return NextResponse.json(
        { error: "Need at least 3 entries to generate insights" },
        { status: 400 }
      );
    }

    const analyzeFn =
      type === "patterns"
        ? analyzePatterns
        : type === "connections"
          ? analyzeConnections
          : analyzeDistillation;

    const results = await analyzeFn(entries);

    // Save each insight
    const saved = [];
    for (const result of results) {
      const [insight] = await db
        .insert(memoriaInsights)
        .values({
          insightType: type,
          title: result.title,
          content: result.content,
          entryIds: JSON.stringify(result.entryIds),
        })
        .returning();
      saved.push(insight);
    }

    revalidateTag('memoria');
    return NextResponse.json({ insights: saved }, { status: 201 });
  } catch (e) {
    logger.error("api/memoria/insights", "Failed to generate insights", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
