import { NextRequest } from "next/server";
import { db, mnemonGraphSnapshots } from "@/db";
import { desc } from "drizzle-orm";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

interface GraphNode {
  id: string;
  content: string;
  category: string;
  importance: number;
  entities: string[];
  tags: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
    nodeCount: number;
    edgeCount: number;
    generatedAt: string;
  };
}

interface ScoredNode {
  node: GraphNode;
  score: number;
  hopDistance: number;
}

function keywordScore(query: string, node: GraphNode): number {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return 0;

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
  if (matches === 0) return 0;

  const coverage = matches / terms.length;
  return coverage * (node.importance || 1);
}

function traverseGraph(
  seeds: ScoredNode[],
  edges: GraphEdge[],
  allNodes: GraphNode[],
  maxHops: number
): ScoredNode[] {
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    if (!adjacency.has(e.target)) adjacency.set(e.target, []);
    adjacency.get(e.source)!.push(e.target);
    adjacency.get(e.target)!.push(e.source);
  }

  const visited = new Map<string, { score: number; hop: number }>();

  // Initialize with seeds
  for (const s of seeds) {
    visited.set(s.node.id, { score: s.score, hop: 0 });
  }

  // BFS expansion
  let frontier = seeds.map((s) => s.node.id);
  for (let hop = 1; hop <= maxHops; hop++) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      const neighbors = adjacency.get(nodeId) || [];
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          const neighborNode = nodeById.get(neighborId);
          if (!neighborNode) continue;
          // Score decays with hop distance
          const parent = visited.get(nodeId)!;
          const decay = 1 / (hop + 1);
          const newScore = parent.score * decay;
          visited.set(neighborId, { score: newScore, hop });
          nextFrontier.push(neighborId);
        }
      }
    }
    frontier = nextFrontier;
  }

  const results: ScoredNode[] = [];
  visited.forEach((data, id) => {
    const node = nodeById.get(id);
    if (node) {
      results.push({ node, score: data.score, hopDistance: data.hop });
    }
  });

  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = body.question?.trim();
    const hopDepth = Math.min(Math.max(body.hopDepth ?? 1, 1), 2);
    const seedLimit = Math.min(Math.max(body.seedLimit ?? 8, 1), 20);
    const contextLimit = Math.min(Math.max(body.contextLimit ?? 15, 1), 30);

    if (!question || typeof question !== "string") {
      return Response.json({ error: "question is required" }, { status: 400 });
    }

    // Fetch latest graph snapshot
    const [latest] = await db
      .select()
      .from(mnemonGraphSnapshots)
      .orderBy(desc(mnemonGraphSnapshots.createdAt))
      .limit(1);

    if (!latest) {
      return Response.json(
        { error: "No graph snapshot available. Run sync-mnemon-to-hq.sh first." },
        { status: 503 }
      );
    }

    let snapshot: GraphSnapshot;
    try {
      snapshot = JSON.parse(latest.snapshotJson);
    } catch {
      return Response.json({ error: "Invalid graph snapshot" }, { status: 500 });
    }

    if (!snapshot.nodes?.length) {
      return Response.json({ error: "Graph has no nodes" }, { status: 503 });
    }

    // Step 1: Find seed nodes via keyword scoring
    const scored = snapshot.nodes
      .map((node) => ({ node, score: keywordScore(question, node), hopDistance: 0 }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, seedLimit);

    if (scored.length === 0) {
      // No keyword matches — try to return something useful by using all high-importance nodes
      const fallback = snapshot.nodes
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 5)
        .map((node) => ({ node, score: 0.1, hopDistance: 0 }));
      scored.push(...fallback);
    }

    // Step 2: Graph traversal from seeds
    const traversed = traverseGraph(scored, snapshot.edges, snapshot.nodes, hopDepth);

    // Step 3: Deduplicate and rank by score descending
    const byId = new Map<string, ScoredNode>();
    for (const s of traversed) {
      const existing = byId.get(s.node.id);
      if (!existing || s.score > existing.score) {
        byId.set(s.node.id, s);
      }
    }

    const contextNodes = Array.from(byId.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, contextLimit);

    // Build context block
    const contextBlock = contextNodes
      .map((s, i) => {
        const n = s.node;
        const entityList = n.entities?.length ? ` | entities: ${n.entities.join(", ")}` : "";
        return `[N${i + 1}] (${n.category}, importance ${n.importance}, hop ${s.hopDistance}${entityList}) ${n.content}`;
      })
      .join("\n\n");

    const systemPrompt = `You are a knowledge graph assistant answering questions based ONLY on the user's personal knowledge graph nodes.

CONTEXT — KNOWLEDGE GRAPH NODES:
${contextBlock}

RULES:
- Answer based ONLY on the provided graph nodes
- Cite specific nodes as [N1], [N2], etc.
- Mention node categories and importance scores when relevant to show confidence
- If the context doesn't contain enough information, say so honestly
- Prefer synthesizing connected ideas across multiple nodes rather than summarizing one node
- Be concise but thorough
- Highlight contradictions or tensions between nodes if they exist`;

    // Build citations BEFORE the Gemini call so fallback can use them
    const citations = contextNodes.map((s) => ({
      id: s.node.id,
      content:
        s.node.content.length > 120
          ? s.node.content.slice(0, 120) + "..."
          : s.node.content,
      category: s.node.category,
      importance: s.node.importance,
      entities: s.node.entities,
      hopDistance: s.hopDistance,
    }));

    // Stream Gemini response
    const geminiRes = await fetch(STREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${systemPrompt}\n\nUSER QUESTION: ${question}`,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.3 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      // Graceful fallback: return the retrieved context nodes without LLM synthesis
      const encoder = new TextEncoder();
      const fallbackStream = new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "citations", citations })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "text",
                text: `⚠️ Synthesis unavailable (${geminiRes.status}). Here are the relevant graph nodes that were found:\n\n`,
              })}\n\n`
            )
          );
          for (let i = 0; i < contextNodes.length; i++) {
            const s = contextNodes[i];
            const n = s.node;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "text",
                  text: `[N${i + 1}] (${n.category}, importance ${n.importance}) ${n.content}\n\n`,
                })}\n\n`
              )
            );
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done" })}\n\n`
            )
          );
          controller.close();
        },
      });
      return new Response(fallbackStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Transform SSE stream
    const encoder = new TextEncoder();
    const reader = geminiRes.body!.getReader();

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "citations", citations })}\n\n`
          )
        );

        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += new TextDecoder().decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(jsonStr);
                  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "text", text })}\n\n`
                      )
                    );
                  }
                } catch {
                  /* skip malformed */
                }
              }
            }
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done" })}\n\n`
            )
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: String(err),
              })}\n\n`
            )
          );
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Graph QA error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
