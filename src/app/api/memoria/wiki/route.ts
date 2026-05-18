import { NextRequest, NextResponse } from "next/server";
import { db, memoriaWikiPages, mnemonGraphSnapshots } from "@/db";
import { eq, desc, like } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// GET /api/memoria/wiki — List wiki pages
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("q");

    let query = db
      .select()
      .from(memoriaWikiPages)
      .where(search ? like(memoriaWikiPages.title, `%${search}%`) : undefined)
      .orderBy(desc(memoriaWikiPages.generatedAt));

    const pages = await query;
    return NextResponse.json({ pages });
  } catch (e) {
    logger.error("api/memoria/wiki", "Failed to list wiki pages", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

interface WikiGenerationRequest {
  topic?: string;
  insightIds?: string[];
  slug?: string;
  title?: string;
}

// POST /api/memoria/wiki — Generate a new wiki page
export async function POST(req: NextRequest) {
  try {
    const body: WikiGenerationRequest = await req.json();
    const { topic, insightIds, slug: requestedSlug, title: requestedTitle } = body;

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
    const nodes: Array<{
      id: string;
      content: string;
      category: string;
      importance: number;
      entities: string[];
      tags: string[];
    }> = snapshot.nodes || [];

    // Determine which insights to cluster
    let selectedInsights = nodes;
    if (insightIds && insightIds.length > 0) {
      selectedInsights = nodes.filter((n) => insightIds.includes(n.id));
    } else if (topic) {
      selectedInsights = nodes.filter(
        (n) =>
          n.content.toLowerCase().includes(topic.toLowerCase()) ||
          n.entities.some((e) => e.toLowerCase().includes(topic.toLowerCase())) ||
          n.tags.some((t) => t.toLowerCase().includes(topic.toLowerCase())),
      );
    }

    if (selectedInsights.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 insights to generate a wiki page" },
        { status: 400 },
      );
    }

    // Generate title and slug if not provided
    const title =
      requestedTitle ||
      (topic ? `${topic.charAt(0).toUpperCase() + topic.slice(1)}` : "Knowledge Cluster");
    const slug =
      requestedSlug ||
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    // Check for duplicate slug
    const [existing] = await db
      .select()
      .from(memoriaWikiPages)
      .where(eq(memoriaWikiPages.slug, slug))
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: `Wiki page with slug "${slug}" already exists` }, { status: 409 });
    }

    // Generate content with Gemini
    const content = await generateWikiContent(title, selectedInsights);

    const [page] = await db
      .insert(memoriaWikiPages)
      .values({
        slug,
        title,
        content,
        sourceInsightIds: JSON.stringify(selectedInsights.map((i) => i.id)),
        clusterTopic: topic || null,
      })
      .returning();

    return NextResponse.json({ page }, { status: 201 });
  } catch (e) {
    logger.error("api/memoria/wiki", "Failed to generate wiki page", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function generateWikiContent(
  title: string,
  insights: Array<{ id: string; content: string; category: string; importance: number }>,
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

  // Clean up any markdown code block wrappers
  return text.replace(/^```markdown\n/, "").replace(/\n```$/, "").trim();
}
