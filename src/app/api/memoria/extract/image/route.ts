import { NextRequest, NextResponse } from "next/server";
import { extractFromImage } from "@/lib/ai/gemini";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { image, source_type, source_title, source_author } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "image (base64) is required" }, { status: 400 });
    }

    const entries = await extractFromImage(image, {
      sourceType: source_type || "book",
      sourceTitle: source_title,
      sourceAuthor: source_author,
    });

    return NextResponse.json({ entries });
  } catch (e) {
    logger.error("api/memoria/extract/image", "Image extraction failed", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
