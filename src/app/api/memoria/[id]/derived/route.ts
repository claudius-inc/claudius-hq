import { NextRequest, NextResponse } from "next/server";
import { db, mnemonGraphSnapshots } from "@/db";
import { desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface GraphNode {
  id: string;
  content: string;
  category: string;
  importance: number;
  entities: string[];
  tags: string[];
}

// GET /api/memoria/[id]/derived
// Returns mnemon insights derived from this entry.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const [latest] = await db
      .select()
      .from(mnemonGraphSnapshots)
      .orderBy(desc(mnemonGraphSnapshots.createdAt))
      .limit(1);

    if (!latest) return NextResponse.json({ insights: [] });

    const snapshot: { nodes: GraphNode[] } = JSON.parse(latest.snapshotJson);
    const tag = `memoria-id:${id}`;
    const derived = (snapshot.nodes || []).filter((n) =>
      (n.entities || []).includes(tag)
    );

    if (derived.length === 0) {
      return NextResponse.json({ insights: [] });
    }

    return NextResponse.json({
      insights: derived.map((d) => ({
        id: d.id,
        content: d.content,
        category: d.category,
        importance: d.importance,
      })),
    });
  } catch (e) {
    logger.error("api/memoria/derived", "Failed", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
