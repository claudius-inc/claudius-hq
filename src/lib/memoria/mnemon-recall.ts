import { db, mnemonGraphSnapshots } from "@/db";
import { desc } from "drizzle-orm";
import { rerank, rerankEnabled } from "./rerank";

export interface MnemonInsight {
  id: string;
  content: string;
  category: string;
  importance: number;
  entities: string[];
  tags: string[];
}

interface Scored {
  node: MnemonInsight;
  score: number;
}

/**
 * Keyword + importance scored recall over the latest mnemon graph snapshot.
 *
 * Not semantic — uses term overlap weighted by node importance. Cheap and
 * runs entirely against the snapshot we already keep in Turso. Upgrade path:
 * push embeddings into Turso and swap in cosine similarity, leaving callers
 * unchanged.
 */
export async function recallMnemon(
  query: string,
  limit = 5
): Promise<MnemonInsight[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const [latest] = await db
    .select()
    .from(mnemonGraphSnapshots)
    .orderBy(desc(mnemonGraphSnapshots.createdAt))
    .limit(1);

  if (!latest) return [];

  let snapshot: { nodes: MnemonInsight[] };
  try {
    snapshot = JSON.parse(latest.snapshotJson);
  } catch {
    return [];
  }

  const terms = q.split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return [];

  const scored: Scored[] = [];
  for (const node of snapshot.nodes || []) {
    const haystack = [
      node.content,
      node.category,
      ...(node.tags || []),
      ...(node.entities || []),
    ]
      .join(" ")
      .toLowerCase();

    let matches = 0;
    for (const t of terms) if (haystack.includes(t)) matches++;
    if (matches === 0) continue;

    const coverage = matches / terms.length;
    scored.push({ node, score: coverage * (node.importance || 1) });
  }

  // Take a wider pool for reranker to chew on, narrower without it.
  const poolSize = rerankEnabled() ? Math.max(limit * 4, 20) : limit;
  const pool = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, poolSize)
    .map((s) => s.node);

  if (!rerankEnabled()) return pool;

  const reranked = await rerank(
    q,
    pool.map((n) => ({ id: n.id, text: n.content })),
    limit
  );
  const byId = new Map(pool.map((n) => [n.id, n]));
  return reranked.map((r) => byId.get(String(r.id))!).filter(Boolean);
}
