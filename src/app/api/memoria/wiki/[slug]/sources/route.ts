import { NextRequest, NextResponse } from "next/server";
import {
  db,
  memoriaWikiPages,
  mnemonGraphSnapshots,
  memoriaEntries,
} from "@/db";
import { eq, desc, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface GraphNode {
  id: string;
  entities: string[];
}

// GET /api/memoria/wiki/[slug]/sources
// Resolves wiki sourceInsightIds → memoria_entries via `memoria-id:N` entity tags.
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug;
    const [page] = await db
      .select()
      .from(memoriaWikiPages)
      .where(eq(memoriaWikiPages.slug, slug))
      .limit(1);

    if (!page) {
      return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
    }

    let insightIds: string[] = [];
    try {
      insightIds = JSON.parse(page.sourceInsightIds || "[]");
    } catch {
      insightIds = [];
    }

    if (insightIds.length === 0) {
      return NextResponse.json({ entries: [] });
    }

    const [latest] = await db
      .select()
      .from(mnemonGraphSnapshots)
      .orderBy(desc(mnemonGraphSnapshots.createdAt))
      .limit(1);

    if (!latest) return NextResponse.json({ entries: [] });

    const snapshot: { nodes: GraphNode[] } = JSON.parse(latest.snapshotJson);
    const wanted = new Set(insightIds);
    const memoriaIds = new Set<number>();
    for (const node of snapshot.nodes || []) {
      if (!wanted.has(node.id)) continue;
      for (const e of node.entities || []) {
        if (e.startsWith("memoria-id:")) {
          const n = parseInt(e.slice("memoria-id:".length), 10);
          if (!isNaN(n)) memoriaIds.add(n);
        }
      }
    }

    if (memoriaIds.size === 0) return NextResponse.json({ entries: [] });

    const entries = await db
      .select()
      .from(memoriaEntries)
      .where(inArray(memoriaEntries.id, Array.from(memoriaIds)));

    return NextResponse.json({ entries });
  } catch (e) {
    logger.error("api/memoria/wiki/sources", "Failed", {
      error: e,
      slug: params.slug,
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
