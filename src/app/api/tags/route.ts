import { NextRequest, NextResponse } from "next/server";
import { db, stockTags, themes } from "@/db";
import { logger } from "@/lib/logger";

// GET /api/tags?q=&limit=50 - Tag autocomplete from union of stock_tags + themes.tags
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);

  try {
    const [stockRows, themeRows] = await Promise.all([
      db.select({ tags: stockTags.tags }).from(stockTags),
      db.select({ tags: themes.tags }).from(themes),
    ]);

    const counts = new Map<string, number>();

    const ingest = (raw: unknown) => {
      let arr: unknown = raw;
      if (typeof raw === "string") {
        try {
          arr = JSON.parse(raw);
        } catch {
          return;
        }
      }
      if (!Array.isArray(arr)) return;
      for (const t of arr) {
        if (typeof t !== "string") continue;
        const tag = t.trim().toLowerCase();
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    };

    for (const row of stockRows) ingest(row.tags);
    for (const row of themeRows) ingest(row.tags);

    let entries = Array.from(counts.entries()).map(([name, count]) => ({
      name,
      count,
    }));

    if (q) {
      entries = entries.filter((e) => e.name.includes(q));
    }

    entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return NextResponse.json({ tags: entries.slice(0, limit) });
  } catch (e) {
    logger.error("api/tags", "Failed to list tags", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
