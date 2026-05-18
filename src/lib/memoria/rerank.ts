/**
 * Snippet reranker — re-scores retrieval candidates against the query.
 *
 * Provider is pluggable. Today: Gemini-Flash (one batched call, ~500ms).
 * Tomorrow: swap to a local bge-reranker via ollama once exposed beyond
 * the VPS boundary. The interface (rerank function below) stays the same.
 *
 * Opt-in via env: set MEMORIA_RERANK=1 to enable.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const RERANK_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

export interface Rankable {
  id: string | number;
  text: string;
}

export function rerankEnabled(): boolean {
  return process.env.MEMORIA_RERANK === "1" && !!GEMINI_API_KEY;
}

/**
 * Rerank `candidates` against `query`, returning them sorted by relevance desc.
 * Returns input order on any failure (graceful degradation — never throws).
 */
export async function rerank<T extends Rankable>(
  query: string,
  candidates: T[],
  topK = candidates.length
): Promise<T[]> {
  if (!rerankEnabled() || candidates.length < 2) {
    return candidates.slice(0, topK);
  }

  const numbered = candidates
    .map((c, i) => `[${i}] ${c.text.slice(0, 600).replace(/\s+/g, " ")}`)
    .join("\n\n");

  const prompt = `You are a relevance scorer. Given a query and ${candidates.length} candidate snippets, return a JSON array of objects {index, score} where score is 0.0-1.0 (1 = highly relevant, 0 = irrelevant). Return ONLY the JSON array, no other text. Score every candidate.

QUERY: ${query}

CANDIDATES:
${numbered}`;

  try {
    const res = await fetch(RERANK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return candidates.slice(0, topK);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return candidates.slice(0, topK);

    const parsed = JSON.parse(text) as Array<{ index: number; score: number }>;
    if (!Array.isArray(parsed)) return candidates.slice(0, topK);

    const scoreById = new Map<number, number>();
    for (const p of parsed) {
      if (typeof p?.index === "number" && typeof p?.score === "number") {
        scoreById.set(p.index, p.score);
      }
    }

    return candidates
      .map((c, i) => ({ c, s: scoreById.get(i) ?? 0 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, topK)
      .map((x) => x.c);
  } catch {
    return candidates.slice(0, topK);
  }
}
