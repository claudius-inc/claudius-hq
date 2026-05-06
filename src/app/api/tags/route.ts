import { NextRequest, NextResponse } from "next/server";
import { listAllTags } from "@/lib/markets/tags";
import { logger } from "@/lib/logger";

// GET /api/tags?q=&limit=50 - Tag autocomplete from the normalized `tags` table.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);

  try {
    const all = await listAllTags();
    const filtered = q ? all.filter((t) => t.name.includes(q)) : all;
    return NextResponse.json({ tags: filtered.slice(0, limit) });
  } catch (e) {
    logger.error("api/tags", "Failed to list tags", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
