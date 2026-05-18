import { NextRequest, NextResponse } from "next/server";
import { db, mnemonGraphSnapshots } from "@/db";
import { desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface GraphSnapshot {
  nodes: Array<{
    id: string;
    content: string;
    category: string;
    importance: number;
    entities: string[];
    tags: string[];
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
    weight: number;
  }>;
  meta: {
    nodeCount: number;
    edgeCount: number;
    generatedAt: string;
  };
}

// GET /api/memoria/mnemon/graph — Return latest graph snapshot
export async function GET(_req: NextRequest) {
  try {
    const [latest] = await db
      .select()
      .from(mnemonGraphSnapshots)
      .orderBy(desc(mnemonGraphSnapshots.createdAt))
      .limit(1);

    if (!latest) {
      return NextResponse.json(
        { nodes: [], edges: [], meta: { nodeCount: 0, edgeCount: 0, generatedAt: null } },
        { status: 200 },
      );
    }

    const snapshot: GraphSnapshot = JSON.parse(latest.snapshotJson);
    return NextResponse.json({
      ...snapshot,
      meta: {
        ...snapshot.meta,
        snapshotId: latest.id,
        snapshotCreatedAt: latest.createdAt,
      },
    });
  } catch (e) {
    logger.error("api/memoria/mnemon/graph", "Failed to fetch graph", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
