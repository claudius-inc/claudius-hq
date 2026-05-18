import { NextRequest, NextResponse } from "next/server";
import { db, mnemonGraphSnapshots } from "@/db";
import { desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

interface GraphNode {
  id: string;
  content: string;
  category: string;
  importance: number;
  entities: string[];
  tags: string[];
}

interface GraphSnapshot {
  nodes: GraphNode[];
  edges: unknown[];
  meta: {
    nodeCount: number;
    edgeCount: number;
    generatedAt: string;
  };
}

interface SemanticResult {
  id: string;
  content: string;
  category: string;
  importance: number;
  entities: string[];
  tags: string[];
}

// POST /api/memoria/search/semantic — Smart text search over mnemon knowledge graph
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { query?: string; limit?: number };
    const query = body.query?.trim().toLowerCase();
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);

    if (!query) {
      return NextResponse.json({ results: [] });
    }

    const [latest] = await db
      .select()
      .from(mnemonGraphSnapshots)
      .orderBy(desc(mnemonGraphSnapshots.createdAt))
      .limit(1);

    if (!latest) {
      return NextResponse.json({ results: [] });
    }

    const snapshot: GraphSnapshot = JSON.parse(latest.snapshotJson);
    const terms = query.split(/\s+/).filter(Boolean);

    const scored = snapshot.nodes.map((node): { node: GraphNode; score: number; matches: number } => {
      const haystack = [
        node.content,
        node.category,
        ...node.tags,
        ...node.entities,
      ]
        .join(" ")
        .toLowerCase();

      let matches = 0;
      for (const term of terms) {
        if (haystack.includes(term)) matches++;
      }

      // Score: term coverage weighted by importance
      const coverage = terms.length > 0 ? matches / terms.length : 0;
      const score = coverage * (node.importance || 1);

      return { node, score, matches };
    });

    const results = scored
      .filter((s) => s.matches > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s): SemanticResult => s.node);

    return NextResponse.json({ results, total: snapshot.nodes.length });
  } catch (e) {
    logger.error("api/memoria/search/semantic", "Semantic search failed", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
