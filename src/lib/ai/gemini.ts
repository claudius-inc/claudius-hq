import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

interface SourceInfo {
  sourceType: string;
  sourceTitle?: string;
  sourceAuthor?: string;
}

export interface ParsedEntry {
  content: string;
  sourceType: string;
  sourceTitle?: string;
  sourceAuthor?: string;
  aiTags?: string[];
  aiSummary?: string;
}

const EXTRACTION_PROMPT = `You are a knowledge extraction assistant. Extract distinct quotes, highlights, ideas, and insights from the provided content.

CRITICAL RULES:
- PRESERVE the original wording. Copy the text verbatim whenever possible.
- Do NOT summarize, compress, or paraphrase the content field. Keep the full passage.
- If a thought spans multiple sentences, include ALL of them — the depth matters.
- Only split into separate entries when the text shifts to a genuinely different idea.
- When the original is a long paragraph making one cohesive argument, keep it as ONE entry.

For each extracted item, return:
- content: the verbatim text (preserve full length — never shorten or rephrase)
- aiTags: 2-5 relevant topic tags (lowercase, no #)
- aiSummary: a one-line summary for search (this IS a summary, unlike content)

Return a JSON array of objects. Only return the JSON array, no other text.

Example output:
[
  {
    "content": "The difficulty of tactical maneuvering consists in turning the devious into the direct, and misfortune into gain. Thus, to take a long and circuitous route, after enticing the enemy out of the way, and though starting after him, to contrive to reach the goal before him, shows knowledge of the artifice of deviation.",
    "aiTags": ["strategy", "tactics", "indirection"],
    "aiSummary": "Turning disadvantageous positions into advantages through indirect approaches"
  }
]`;

export async function extractFromText(
  text: string,
  sourceInfo: SourceInfo,
): Promise<ParsedEntry[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `${EXTRACTION_PROMPT}

Source type: ${sourceInfo.sourceType}
${sourceInfo.sourceTitle ? `Source title: ${sourceInfo.sourceTitle}` : ""}
${sourceInfo.sourceAuthor ? `Source author: ${sourceInfo.sourceAuthor}` : ""}

Content to extract from:
${text}`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed: Array<{
    content: string;
    aiTags?: string[];
    aiSummary?: string;
  }> = JSON.parse(jsonMatch[0]);

  return parsed.map((item) => ({
    content: item.content,
    sourceType: sourceInfo.sourceType,
    sourceTitle: sourceInfo.sourceTitle,
    sourceAuthor: sourceInfo.sourceAuthor,
    aiTags: item.aiTags,
    aiSummary: item.aiSummary,
  }));
}

// ============================================================================
// Analysis — Phase 2: Pattern Discovery
// ============================================================================

export interface AnalysisResult {
  title: string;
  content: string; // markdown
  entryIds: number[];
}

interface AnalysisEntry {
  id: number;
  content: string;
  sourceType: string;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  myNote: string | null;
  aiTags: string | null;
}

function formatEntriesForPrompt(entries: AnalysisEntry[]): string {
  return entries
    .map(
      (e) =>
        `[#${e.id}] (${e.sourceType}${e.sourceTitle ? ` — ${e.sourceTitle}` : ""}${e.sourceAuthor ? ` by ${e.sourceAuthor}` : ""})
"${e.content}"${e.myNote ? `\nNote: ${e.myNote}` : ""}${e.aiTags ? `\nTags: ${e.aiTags}` : ""}`,
    )
    .join("\n\n");
}

export async function analyzePatterns(
  entries: AnalysisEntry[],
): Promise<AnalysisResult[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

  const prompt = `You are analyzing a personal knowledge collection. Find recurring themes and patterns across these entries.

Rules:
- Look for ideas that appear across MULTIPLE entries, especially from different sources
- Each pattern should reference at least 2 entries by their [#id]
- Write in second person ("You keep returning to...", "A thread through your thinking...")
- Be specific — name the actual ideas, don't be vague
- Output markdown with the pattern title as ## heading
- After each pattern, list the entry IDs that contribute to it

Return a JSON array of patterns:
[
  {
    "title": "Pattern name",
    "content": "Markdown analysis with specific references to entries",
    "entryIds": [1, 5, 12]
  }
]

Only return the JSON array.

Entries:
${formatEntriesForPrompt(entries)}`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  return JSON.parse(jsonMatch[0]);
}

export async function analyzeConnections(
  entries: AnalysisEntry[],
): Promise<AnalysisResult[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

  const prompt = `You are analyzing a personal knowledge collection. Find surprising connections between entries that seem unrelated on the surface but share a deeper structure or principle.

Rules:
- Each connection must link exactly 2-3 entries from DIFFERENT sources or contexts
- Explain what the shared deeper principle is — the non-obvious link
- Write in second person ("You captured X from a business book and Y from philosophy — both are really about...")
- Be specific and insightful, not surface-level
- Output markdown

Return a JSON array:
[
  {
    "title": "Connection name",
    "content": "Markdown explaining the hidden link between the entries",
    "entryIds": [3, 17]
  }
]

Only return the JSON array.

Entries:
${formatEntriesForPrompt(entries)}`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  return JSON.parse(jsonMatch[0]);
}

export async function analyzeDistillation(
  entries: AnalysisEntry[],
): Promise<AnalysisResult[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

  const prompt = `You are analyzing a personal knowledge collection. Distill these entries into personal frameworks — what do they collectively reveal about how this person thinks?

Rules:
- Synthesize clusters of related entries into a coherent personal principle or framework
- Write as if you're helping the person see their own philosophy: "Based on what you've collected, your operating principle for X seems to be..."
- Each framework should draw from 3+ entries
- Be bold in the synthesis — connect the dots they haven't connected yet
- Output markdown with clear structure

Return a JSON array:
[
  {
    "title": "Framework/principle name",
    "content": "Markdown synthesis drawing from multiple entries into a cohesive personal framework",
    "entryIds": [2, 7, 11, 15]
  }
]

Only return the JSON array.

Entries:
${formatEntriesForPrompt(entries)}`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  return JSON.parse(jsonMatch[0]);
}

export async function extractFromImage(
  base64: string,
  sourceInfo: SourceInfo,
): Promise<ParsedEntry[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `${EXTRACTION_PROMPT}

Source type: ${sourceInfo.sourceType}
${sourceInfo.sourceTitle ? `Source title: ${sourceInfo.sourceTitle}` : ""}
${sourceInfo.sourceAuthor ? `Source author: ${sourceInfo.sourceAuthor}` : ""}

Extract quotes, highlights, and insights from this image.`;

  const mimeType = base64.startsWith("/9j/") ? "image/jpeg" : "image/png";

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType,
        data: base64,
      },
    },
  ]);
  const response = result.response.text();

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed: Array<{
    content: string;
    aiTags?: string[];
    aiSummary?: string;
  }> = JSON.parse(jsonMatch[0]);

  return parsed.map((item) => ({
    content: item.content,
    sourceType: sourceInfo.sourceType,
    sourceTitle: sourceInfo.sourceTitle,
    sourceAuthor: sourceInfo.sourceAuthor,
    aiTags: item.aiTags,
    aiSummary: item.aiSummary,
  }));
}
