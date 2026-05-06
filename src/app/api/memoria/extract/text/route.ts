import { NextRequest, NextResponse } from "next/server";
import { extractFromText } from "@/lib/ai/gemini";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { text, source_type, source_title, source_author } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const entries = await extractFromText(text, {
      sourceType: source_type || "article",
      sourceTitle: source_title,
      sourceAuthor: source_author,
    });

    return NextResponse.json({ entries });
  } catch (e) {
    logger.error("api/memoria/extract/text", "Text extraction failed", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
