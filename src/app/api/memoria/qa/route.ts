import { NextRequest } from "next/server";
import { client } from "@/db";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
const STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

interface EntryRow {
  id: number;
  content: string;
  source_title: string | null;
  source_author: string | null;
  tags: string | null;
  content_embedding: Buffer | null;
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

async function embedText(text: string): Promise<Float32Array> {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: text.slice(0, 2000) }] },
      outputDimensionality: 256,
    }),
  });
  if (!res.ok) throw new Error(`Embedding error: ${res.status}`);
  const data = await res.json();
  return new Float32Array(data.embedding.values);
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string") {
      return Response.json({ error: "question is required" }, { status: 400 });
    }

    // Embed the question
    const queryVec = await embedText(question);

    // Fetch all entries with embeddings
    const { rows } = await client.execute(
      "SELECT id, content, source_title, source_author, tags, content_embedding FROM memoria_entries WHERE content_embedding IS NOT NULL"
    );

    // Compute similarity and rank
    const scored = (rows as unknown as EntryRow[])
      .map((row) => {
        const emb = new Float32Array(row.content_embedding!.buffer, row.content_embedding!.byteOffset, row.content_embedding!.byteLength / 4);
        return { ...row, score: cosineSim(queryVec, emb) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // Build context
    const contextEntries = scored.map((e, i) => {
      const source = [e.source_title, e.source_author].filter(Boolean).join(" by ");
      return `[${i + 1}] (${source || "Unknown"}) ${e.content}`;
    }).join("\n\n");

    const systemPrompt = `You are a knowledgeable assistant answering questions based ONLY on the user's personal collection of notes, highlights, and quotes from books and other sources.

CONTEXT (the user's collection):
${contextEntries}

RULES:
- Answer based ONLY on the provided context
- If the context doesn't contain enough information, say so honestly
- Cite specific entries by their source (book title + author)
- When referencing a quote or insight, mention which book it came from
- Format citations as [1], [2] etc. referencing the numbered entries
- Be concise but thorough`;

    // Stream Gemini response
    const geminiRes = await fetch(STREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nUSER QUESTION: ${question}` }] }],
        generationConfig: { temperature: 0.3 },
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return Response.json({ error: `Gemini error: ${geminiRes.status}` }, { status: 502 });
    }

    // Build citations for the response header
    const citations = scored.map((e) => ({
      id: e.id,
      sourceTitle: e.source_title,
      sourceAuthor: e.source_author,
    }));

    // Transform SSE stream from Gemini to our format
    const encoder = new TextEncoder();
    const reader = geminiRes.body!.getReader();

    const stream = new ReadableStream({
      async start(controller) {
        // Send citations first
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "citations", citations })}\n\n`));

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
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text })}\n\n`));
                  }
                } catch { /* skip malformed */ }
              }
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`));
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
    console.error("QA error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
