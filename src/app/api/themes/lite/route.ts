import { NextResponse } from "next/server";
import { db, themes, themeStocks } from "@/db";
import { logger } from "@/lib/logger";

// GET /api/themes/lite - Fast theme list (no price fetching)
// Returns theme metadata + stock lists from DB only
export async function GET() {
  try {
    // Get all themes
    const allThemes = await db.select().from(themes).orderBy(themes.name);

    // Get all theme stocks
    const allStocks = await db.select().from(themeStocks);

    // Group stocks by theme
    const stocksByTheme = new Map<number, string[]>();
    for (const stock of allStocks) {
      const existing = stocksByTheme.get(stock.themeId) || [];
      existing.push(stock.ticker);
      stocksByTheme.set(stock.themeId, existing);
    }

    // Build response with just DB data
    const themesLite = allThemes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      description: theme.description || "",
      created_at: theme.createdAt || "",
      stocks: stocksByTheme.get(theme.id) || [],
    }));

    return NextResponse.json(
      { themes: themesLite },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    logger.error("api/themes/lite", "Failed to get themes", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
