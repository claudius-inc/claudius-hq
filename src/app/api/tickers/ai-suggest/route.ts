import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, themes } from "@/db";
import { listAllTags } from "@/lib/tags";
import { logger } from "@/lib/logger";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const MODEL_NAME = "gemini-2.5-flash";

interface AiSuggestBody {
  ticker?: string;
  name?: string;
  sector?: string;
  exchange?: string;
  market?: string;
}

interface SuggestedTag {
  name: string;
  isExisting: boolean;
}

interface SuggestedTheme {
  name: string;
  id: number | null;
  isExisting: boolean;
}

interface SuggestResponse {
  description: string;
  tags: SuggestedTag[];
  themes: SuggestedTheme[];
}

interface RawGeminiResult {
  description?: unknown;
  tags?: unknown;
  themes?: unknown;
}

function pickJsonObject(text: string): RawGeminiResult | null {
  // Strip code fences if present.
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  // Match the first {...} block (greedy enough to handle nested braces in
  // description strings — the prompt forbids them but be defensive).
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as RawGeminiResult;
  } catch {
    return null;
  }
}

// POST /api/tickers/ai-suggest
// Body: { ticker, name?, sector?, exchange?, market? }
// Returns description + tags + themes, marking each item as existing-or-new.
// Does NOT mutate the DB — persistence happens when the user submits the modal.
export async function POST(req: NextRequest) {
  let body: AiSuggestBody;
  try {
    body = (await req.json()) as AiSuggestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ticker = body.ticker?.trim();
  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const [allTags, allThemes] = await Promise.all([
      listAllTags(),
      db.select({ id: themes.id, name: themes.name }).from(themes),
    ]);

    const existingTagSet = new Set(allTags.map((t) => t.name));
    const themeByName = new Map(
      allThemes.map((t) => [t.name.toLowerCase(), { id: t.id, name: t.name }]),
    );

    const tagVocabulary = allTags
      .slice(0, 200) // cap to keep prompt size sane
      .map((t) => t.name)
      .join(", ");
    const themeVocabulary = allThemes
      .map((t) => `"${t.name}"`)
      .join(", ");

    const prompt = `You're classifying a publicly traded stock for an investment research tool.

Ticker: ${ticker}
Company: ${body.name || "(unknown)"}
Sector: ${body.sector || "(unknown)"}
Exchange: ${body.exchange || "(unknown)"}
Market: ${body.market || "(unknown)"}

Existing tag vocabulary (lowercase, hyphenated): ${tagVocabulary || "(none yet)"}
Existing themes: ${themeVocabulary || "(none yet)"}

Return STRICT JSON with this shape, and nothing else (no code fences, no commentary):
{
  "description": "1-2 sentences describing what the company does. Plain prose. No marketing fluff. No braces inside the string.",
  "tags": ["tag1", "tag2"],
  "themes": ["Theme A", "Theme B"]
}

Rules:
- tags: 2-5 items. Prefer existing vocabulary verbatim. Lowercase, hyphenated. Suggest a NEW tag only when no existing tag fits.
- themes: 1-3 items. Prefer existing theme names verbatim (case-sensitive). Only suggest a brand-new theme when nothing existing fits.
- Do not include any keys other than description, tags, themes.`;

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const parsed = pickJsonObject(text);
    if (!parsed) {
      logger.warn("api/tickers/ai-suggest", "Could not parse Gemini response", {
        ticker,
        textPreview: text.slice(0, 200),
      });
      return NextResponse.json({ error: "AI response could not be parsed" }, { status: 502 });
    }

    const description =
      typeof parsed.description === "string" ? parsed.description.trim() : "";

    const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
    const rawThemes = Array.isArray(parsed.themes) ? parsed.themes : [];

    const seenTags = new Set<string>();
    const tags: SuggestedTag[] = [];
    for (const t of rawTags) {
      if (typeof t !== "string") continue;
      const norm = t.trim().toLowerCase();
      if (!norm || seenTags.has(norm)) continue;
      seenTags.add(norm);
      tags.push({ name: norm, isExisting: existingTagSet.has(norm) });
    }

    const seenThemes = new Set<string>();
    const themesOut: SuggestedTheme[] = [];
    for (const t of rawThemes) {
      if (typeof t !== "string") continue;
      const trimmed = t.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seenThemes.has(key)) continue;
      seenThemes.add(key);
      const match = themeByName.get(key);
      if (match) {
        themesOut.push({ name: match.name, id: match.id, isExisting: true });
      } else {
        themesOut.push({ name: trimmed, id: null, isExisting: false });
      }
    }

    const response: SuggestResponse = {
      description,
      tags,
      themes: themesOut,
    };

    logger.info("api/tickers/ai-suggest", "Suggested classification", {
      ticker,
      tagCount: tags.length,
      newTags: tags.filter((t) => !t.isExisting).length,
      themeCount: themesOut.length,
      newThemes: themesOut.filter((t) => !t.isExisting).length,
    });

    return NextResponse.json(response);
  } catch (e) {
    logger.error("api/tickers/ai-suggest", "Failed to generate suggestions", {
      error: e,
      ticker,
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
