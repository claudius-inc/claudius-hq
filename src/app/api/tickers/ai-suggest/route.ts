import { NextRequest, NextResponse } from "next/server";
import { generateTickerAiResult } from "@/lib/ai/ticker-ai";
import { logger } from "@/lib/logger";

interface AiSuggestBody {
  ticker?: string;
  name?: string;
  sector?: string;
  exchange?: string;
  market?: string;
}

// POST /api/tickers/ai-suggest
// Body: { ticker, name?, sector?, exchange?, market? }
// Returns description + tags + themes + qualitative profile, marking each
// classification item as existing-or-new. Does NOT mutate the DB —
// persistence happens when the user submits the modal (POST /api/tickers).
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
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const result = await generateTickerAiResult({
      ticker,
      name: body.name,
      sector: body.sector,
      exchange: body.exchange,
      market: body.market,
    });

    logger.info("api/tickers/ai-suggest", "Suggested classification", {
      ticker,
      tagCount: result.tags.length,
      newTags: result.tags.filter((t) => !t.isExisting).length,
      themeCount: result.themes.length,
      newThemes: result.themes.filter((t) => !t.isExisting).length,
      hasProfile:
        !!result.profile.revenueModel ||
        !!result.profile.cyclicality ||
        (result.profile.revenueSegments?.length ?? 0) > 0,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "AI response could not be parsed") {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    logger.error("api/tickers/ai-suggest", "Failed to generate suggestions", {
      error: e,
      ticker,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
