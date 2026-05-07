import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, themes } from "@/db";
import { listAllTags } from "@/lib/markets/tags";
import { logger } from "@/lib/logger";

// Two Gemini paths so the modal-time call is fast:
//   - FAST_MODEL (Flash) handles the classification (description + tags +
//     themes) shown directly in the AddTickerModal. Cheap, ~3-5s.
//   - DEEP_MODEL (Pro) handles the qualitative SWOT profile that backs the
//     ticker detail page. Slower, ~15-25s, only run by backfill / explicit
//     re-draft / `generateTickerAiResult` (parallel batch).
// Both calls use `responseMimeType: "application/json"` so Gemini commits to
// valid JSON without spending tokens on prose framing.

const FAST_MODEL = "gemini-2.0-flash";
const DEEP_MODEL = "gemini-3.1-pro-preview";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface TickerProfile {
  revenueModel: string | null;
  revenueSegments: { item: string; pct: number }[] | null;
  cyclicality: string | null;
  tailwinds: string[] | null;
  headwinds: string[] | null;
  threats: string[] | null;
  opportunities: string[] | null;
  customerConcentration: string | null;
}

export interface SuggestedTag {
  name: string;
  isExisting: boolean;
}

export interface SuggestedTheme {
  name: string;
  id: number | null;
  isExisting: boolean;
}

export interface TickerAiResult {
  description: string;
  tags: SuggestedTag[];
  themes: SuggestedTheme[];
  profile: TickerProfile;
}

export interface TickerAiInput {
  ticker: string;
  name?: string | null;
  sector?: string | null;
  exchange?: string | null;
  market?: string | null;
}

function pickJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = asString(item);
    if (s) out.push(s);
  }
  return out.length > 0 ? out : null;
}

function asSegments(v: unknown): { item: string; pct: number }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { item: string; pct: number }[] = [];
  for (const seg of v) {
    if (!seg || typeof seg !== "object") continue;
    const s = seg as { item?: unknown; pct?: unknown };
    const item = asString(s.item);
    const pct = typeof s.pct === "number" ? s.pct : Number(s.pct);
    if (item && Number.isFinite(pct)) {
      out.push({ item, pct: Math.max(0, Math.min(100, pct)) });
    }
  }
  return out.length > 0 ? out : null;
}

function emptyProfile(): TickerProfile {
  return {
    revenueModel: null,
    revenueSegments: null,
    cyclicality: null,
    tailwinds: null,
    headwinds: null,
    threats: null,
    opportunities: null,
    customerConcentration: null,
  };
}

function parseProfile(raw: unknown): TickerProfile {
  if (!raw || typeof raw !== "object") return emptyProfile();
  const r = raw as Record<string, unknown>;
  return {
    revenueModel: asString(r.revenueModel),
    revenueSegments: asSegments(r.revenueSegments),
    cyclicality: asString(r.cyclicality),
    tailwinds: asStringArray(r.tailwinds),
    headwinds: asStringArray(r.headwinds),
    threats: asStringArray(r.threats),
    opportunities: asStringArray(r.opportunities),
    customerConcentration: asString(r.customerConcentration),
  };
}

function tickerHeader(input: TickerAiInput): string {
  return `Ticker: ${input.ticker}
Company: ${input.name || "(unknown)"}
Sector: ${input.sector || "(unknown)"}
Exchange: ${input.exchange || "(unknown)"}
Market: ${input.market || "(unknown)"}`;
}

function buildClassificationPrompt(
  input: TickerAiInput,
  tagVocabulary: string,
  themeVocabulary: string,
): string {
  return `You're classifying a publicly traded stock for an investment research tool.

${tickerHeader(input)}

Existing tag vocabulary (lowercase, hyphenated): ${tagVocabulary || "(none yet)"}
Existing themes: ${themeVocabulary || "(none yet)"}

Return STRICT JSON with this exact shape:
{
  "description": "1-2 sentences describing what the company does. Plain prose. No marketing fluff.",
  "tags": ["tag1", "tag2"],
  "themes": ["Theme A", "Theme B"]
}

Rules:
- tags: 2-5 items. Prefer existing vocabulary verbatim. Lowercase, hyphenated. Suggest a NEW tag only when no existing tag fits.
- themes: 1-3 items. Prefer existing theme names verbatim (case-sensitive).
- Do not include any keys other than the ones shown above.`;
}

function buildProfilePrompt(input: TickerAiInput): string {
  return `You're profiling a publicly traded stock for an investment research tool.

${tickerHeader(input)}

Return STRICT JSON with this exact shape:
{
  "revenueModel": "1 sentence on HOW the company makes money (e.g. transactional fees per trade; subscription SaaS; product sales + services).",
  "revenueSegments": [{"item": "Segment name", "pct": 60}, {"item": "Other", "pct": 40}],
  "cyclicality": "1 short clause on cyclicality (e.g. 'highly cyclical, tied to capex spend' or 'defensive, recession-resistant consumer staples' or 'secular growth, AI compute demand').",
  "tailwinds": ["concrete macro/secular tailwind 1", "tailwind 2"],
  "headwinds": ["concrete macro/structural headwind 1", "headwind 2"],
  "threats": ["firm-specific threat 1 (regulatory, competitive, technological)", "threat 2"],
  "opportunities": ["firm-specific opportunity 1 (new market, product, geography)", "opportunity 2"],
  "customerConcentration": "1 short sentence: top customers, % of revenue from largest customer if known, or 'diversified' / 'unknown' if not concentrated or unclear."
}

Rules:
- revenueSegments: 2-5 segments, percentages should approximately sum to 100. If you don't know exact splits, give your best-estimate breakdown — DO NOT invent precise numbers; round to 5% or 10%. If truly unknown, return an empty array [].
- Lists (tailwinds/headwinds/threats/opportunities): 2-4 items each. Be specific to THIS company, not generic platitudes. If unknown for a field, return an empty array [].
- All string fields: factual, terse, no hype. If unknown, return an empty string "".
- Do not include any keys other than the ones shown above.`;
}

// Normalize the model's tags array against the existing tag vocabulary.
function normalizeTags(
  raw: unknown,
  existingTagSet: Set<string>,
): SuggestedTag[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: SuggestedTag[] = [];
  for (const t of list) {
    if (typeof t !== "string") continue;
    const norm = t.trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ name: norm, isExisting: existingTagSet.has(norm) });
  }
  return out;
}

// Normalize the model's themes array against the existing themes table.
function normalizeThemes(
  raw: unknown,
  themeByName: Map<string, { id: number; name: string }>,
): SuggestedTheme[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: SuggestedTheme[] = [];
  for (const t of list) {
    if (typeof t !== "string") continue;
    const trimmed = t.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const match = themeByName.get(key);
    if (match) {
      out.push({ name: match.name, id: match.id, isExisting: true });
    } else {
      out.push({ name: trimmed, id: null, isExisting: false });
    }
  }
  return out;
}

// Fast classification path used by the AddTickerModal — Flash + JSON mode.
// Returns description + tags + themes only. Typical latency 3-5s.
export async function generateTickerClassification(
  input: TickerAiInput,
): Promise<Pick<TickerAiResult, "description" | "tags" | "themes">> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const [allTags, allThemes] = await Promise.all([
    listAllTags(),
    db.select({ id: themes.id, name: themes.name }).from(themes),
  ]);

  const existingTagSet = new Set(allTags.map((t) => t.name));
  const themeByName = new Map(
    allThemes.map((t) => [t.name.toLowerCase(), { id: t.id, name: t.name }]),
  );

  const tagVocabulary = allTags
    .slice(0, 200)
    .map((t) => t.name)
    .join(", ");
  const themeVocabulary = allThemes.map((t) => `"${t.name}"`).join(", ");

  const prompt = buildClassificationPrompt(input, tagVocabulary, themeVocabulary);

  const model = genAI.getGenerativeModel({
    model: FAST_MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const parsed = pickJsonObject(text);
  if (!parsed) {
    logger.warn("ticker-ai", "Could not parse classification response", {
      ticker: input.ticker,
      textPreview: text.slice(0, 200),
    });
    throw new Error("AI response could not be parsed");
  }

  return {
    description: asString(parsed.description) || "",
    tags: normalizeTags(parsed.tags, existingTagSet),
    themes: normalizeThemes(parsed.themes, themeByName),
  };
}

// Slow profile path used by backfill / explicit re-draft — Pro + JSON mode.
// Typical latency 15-25s.
export async function generateTickerProfile(
  input: TickerAiInput,
): Promise<TickerProfile> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const prompt = buildProfilePrompt(input);

  const model = genAI.getGenerativeModel({
    model: DEEP_MODEL,
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const parsed = pickJsonObject(text);
  if (!parsed) {
    logger.warn("ticker-ai", "Could not parse profile response", {
      ticker: input.ticker,
      textPreview: text.slice(0, 200),
    });
    throw new Error("AI response could not be parsed");
  }

  return parseProfile(parsed);
}

// Generate a full ticker profile + classification via Gemini. Runs the two
// paths in parallel — classification (fast) + profile (slow). Used by the
// re-draft flow and the backfill script. Modal auto-suggest uses
// `generateTickerClassification` directly to avoid waiting on profile.
//
// Throws on:
//   - missing GEMINI_API_KEY
//   - Gemini API failure
//   - response that can't be parsed as JSON
export async function generateTickerAiResult(
  input: TickerAiInput,
): Promise<TickerAiResult> {
  const [classification, profile] = await Promise.all([
    generateTickerClassification(input),
    generateTickerProfile(input),
  ]);
  return { ...classification, profile };
}

// ============================================================================
// Profile (de)serialization for the JSON-as-text DB columns.
// ============================================================================

// Translate the in-memory TickerProfile to the column-shape we store in
// scanner_universe. Empty arrays / null strings -> null so we don't leave
// "[]" or "" sentinels in the DB.
export function profileToColumns(profile: TickerProfile): {
  revenueModel: string | null;
  revenueSegments: string | null;
  cyclicality: string | null;
  tailwinds: string | null;
  headwinds: string | null;
  threats: string | null;
  opportunities: string | null;
  customerConcentration: string | null;
} {
  return {
    revenueModel: profile.revenueModel,
    revenueSegments:
      profile.revenueSegments && profile.revenueSegments.length > 0
        ? JSON.stringify(profile.revenueSegments)
        : null,
    cyclicality: profile.cyclicality,
    tailwinds:
      profile.tailwinds && profile.tailwinds.length > 0
        ? JSON.stringify(profile.tailwinds)
        : null,
    headwinds:
      profile.headwinds && profile.headwinds.length > 0
        ? JSON.stringify(profile.headwinds)
        : null,
    threats:
      profile.threats && profile.threats.length > 0
        ? JSON.stringify(profile.threats)
        : null,
    opportunities:
      profile.opportunities && profile.opportunities.length > 0
        ? JSON.stringify(profile.opportunities)
        : null,
    customerConcentration: profile.customerConcentration,
  };
}

function safeParseStringArray(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return asStringArray(parsed);
  } catch {
    return null;
  }
}

function safeParseSegments(
  raw: string | null | undefined,
): { item: string; pct: number }[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return asSegments(parsed);
  } catch {
    return null;
  }
}

// Translate a scanner_universe DB row into a TickerProfile. Defensive: any
// malformed JSON in the legacy columns falls back to null rather than
// throwing.
export function columnsToProfile(row: {
  revenueModel?: string | null;
  revenueSegments?: string | null;
  cyclicality?: string | null;
  tailwinds?: string | null;
  headwinds?: string | null;
  threats?: string | null;
  opportunities?: string | null;
  customerConcentration?: string | null;
}): TickerProfile {
  return {
    revenueModel: row.revenueModel ?? null,
    revenueSegments: safeParseSegments(row.revenueSegments),
    cyclicality: row.cyclicality ?? null,
    tailwinds: safeParseStringArray(row.tailwinds),
    headwinds: safeParseStringArray(row.headwinds),
    threats: safeParseStringArray(row.threats),
    opportunities: safeParseStringArray(row.opportunities),
    customerConcentration: row.customerConcentration ?? null,
  };
}

export function isProfileEmpty(profile: TickerProfile): boolean {
  return (
    !profile.revenueModel &&
    !profile.cyclicality &&
    !profile.customerConcentration &&
    (!profile.revenueSegments || profile.revenueSegments.length === 0) &&
    (!profile.tailwinds || profile.tailwinds.length === 0) &&
    (!profile.headwinds || profile.headwinds.length === 0) &&
    (!profile.threats || profile.threats.length === 0) &&
    (!profile.opportunities || profile.opportunities.length === 0)
  );
}
