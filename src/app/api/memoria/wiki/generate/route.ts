import { NextRequest, NextResponse } from "next/server";
import { db, memoriaWikiPages, mnemonGraphSnapshots } from "@/db";
import { eq, desc } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// POST /api/memoria/wiki/generate — Auto-generate wiki pages from graph clusters
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode = "top_entities", maxPages = 3 } = body;

    // Fetch latest graph snapshot
    const [latestSnapshot] = await db
      .select()
      .from(mnemonGraphSnapshots)
      .orderBy(desc(mnemonGraphSnapshots.createdAt))
      .limit(1);

    if (!latestSnapshot) {
      return NextResponse.json({ error: "No graph snapshot available" }, { status: 400 });
    }

    const snapshot = JSON.parse(latestSnapshot.snapshotJson);
    const nodes = snapshot.nodes || [];

    if (nodes.length === 0) {
      return NextResponse.json({ error: "Graph snapshot has no nodes" }, { status: 400 });
    }

    let generatedPages = [];

    if (mode === "top_entities") {
      // Find most common entities
      const entityCounts: Record<string, { count: number; nodes: typeof nodes }> = {};
      for (const node of nodes) {
        for (const entity of node.entities || []) {
          if (!entityCounts[entity]) {
            entityCounts[entity] = { count: 0, nodes: [] };
          }
          entityCounts[entity].count++;
          entityCounts[entity].nodes.push(node);
        }
      }

      const sortedEntities = Object.entries(entityCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, maxPages);

      for (const [entity, data] of sortedEntities) {
        const title = entity;
        const slug = entity.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

        // Skip if already exists
        const [existing] = await db
          .select()
          .from(memoriaWikiPages)
          .where(eq(memoriaWikiPages.slug, slug))
          .limit(1);

        if (existing) continue;

        const content = await generateWikiContent(title, data.nodes.slice(0, 20));

        const [page] = await db
          .insert(memoriaWikiPages)
          .values({
            slug,
            title,
            content,
            sourceInsightIds: JSON.stringify(data.nodes.map((n: {id: string}) => n.id)),
            clusterTopic: entity,
          })
          .returning();

        generatedPages.push(page);
      }
    }

    return NextResponse.json({ pages: generatedPages, count: generatedPages.length });
  } catch (e) {
    logger.error("api/memoria/wiki/generate", "Failed to auto-generate wiki pages", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function generateWikiContent(
  title: string,
  insights: Array<{ id: string; content: string; category: string; importance: number }>
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const insightsText = insights
    .map((i, idx) => `[${idx + 1}] (${i.category}, importance ${i.importance}) ${i.content}`)
    .join("\n\n");

  const prompt = `You are a knowledge synthesis assistant. Create a wiki-style narrative article from the following insights.

Title: ${title}

Insights:
${insightsText}

Write a comprehensive, well-structured wiki article in Markdown format:
- Start with a brief summary/overview paragraph
- Use ## headings for main sections
- Link back to individual insights using [insight 1], [insight 2], etc.
- Be specific and factual — don't make things up
- Keep it concise but informative (400-800 words)

Return ONLY the markdown content, no other text.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  return text.replace(/^```markdown\n/, "").replace(/\n```$/, "").trim();
}
