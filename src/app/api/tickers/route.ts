import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { eq, and, sql } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";
import { db, scannerUniverse, themes, themeStocks } from "@/db";
import {
  normalizeTickerForMarket,
  normalizeMarketCode,
  detectMarketFromYahoo,
} from "@/lib/scanner/ticker-normalize";
import {
  getTagsForTicker,
  setTickerTags,
  setThemeTags,
} from "@/lib/tags";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface YahooQuote {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  exchange?: string;
  fullExchangeName?: string;
  sector?: string;
  industry?: string;
}

interface NewThemeInput {
  name: string;
  description?: string;
  tags?: string[];
}

interface AddTickerBody {
  ticker?: string;
  market?: string;
  name?: string;
  sector?: string;
  notes?: string;
  tags?: string[];
  themeIds?: number[];
  newThemes?: NewThemeInput[];
}

const MARKET_CANDIDATES = ["US", "SGX", "HK", "JP", "CN"] as const;

async function tryQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    const result = (await yahooFinance.quote(symbol)) as YahooQuote | YahooQuote[];
    const q = Array.isArray(result) ? result[0] : result;
    if (!q || !q.symbol) return null;
    if (q.regularMarketPrice == null && !q.shortName && !q.longName) return null;
    return q;
  } catch {
    return null;
  }
}

function normalizeTagList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const tag = v.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

// POST /api/tickers
// Body: { ticker, market?, name?, sector?, notes?, tags: string[], themeIds: number[], newThemes?: [...] }
export async function POST(request: NextRequest) {
  let body: AddTickerBody;
  try {
    body = (await request.json()) as AddTickerBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tickerRaw = body.ticker?.trim();
  if (!tickerRaw) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  try {
    // 1. Normalize ticker + market
    let market = body.market ? normalizeMarketCode(body.market) : "";
    let normalized: string;
    let quote: YahooQuote | null = null;

    if (market) {
      normalized = normalizeTickerForMarket(tickerRaw, market);
      quote = await tryQuote(normalized);
    } else {
      let found: { normalized: string; market: string; quote: YahooQuote } | null = null;
      for (const m of MARKET_CANDIDATES) {
        const candidate = normalizeTickerForMarket(tickerRaw, m);
        const q = await tryQuote(candidate);
        if (q) {
          const detected =
            detectMarketFromYahoo({
              exchange: q.exchange,
              fullExchangeName: q.fullExchangeName,
              symbol: q.symbol,
            }) ?? m;
          found = { normalized: candidate, market: detected, quote: q };
          break;
        }
      }
      if (!found) {
        return NextResponse.json(
          { error: `No quote found for "${tickerRaw}"` },
          { status: 400 },
        );
      }
      normalized = found.normalized;
      market = found.market;
      quote = found.quote;
    }

    if (!quote) {
      return NextResponse.json(
        { error: `Ticker "${normalized}" did not resolve to a Yahoo quote` },
        { status: 400 },
      );
    }

    const finalName =
      body.name?.trim() || quote.shortName || quote.longName || null;
    const finalSector = body.sector?.trim() || quote.sector || quote.industry || null;
    const tagList = normalizeTagList(body.tags);
    const newThemes = Array.isArray(body.newThemes) ? body.newThemes : [];
    const requestedThemeIds = Array.isArray(body.themeIds)
      ? body.themeIds.filter((n) => Number.isInteger(n))
      : [];

    // 2. Detect existing universe row to set the response "created" flag.
    const existingUniverse = await db
      .select({ id: scannerUniverse.id })
      .from(scannerUniverse)
      .where(eq(scannerUniverse.ticker, normalized))
      .limit(1);
    const isNewTicker = existingUniverse.length === 0;

    // 3. Upsert scanner_universe.
    await db
      .insert(scannerUniverse)
      .values({
        ticker: normalized,
        market,
        name: finalName,
        sector: finalSector,
        source: "user",
        notes: body.notes?.trim() || null,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: scannerUniverse.ticker,
        set: {
          market,
          name: finalName,
          sector: finalSector,
          notes: body.notes?.trim() || null,
          updatedAt: sql`datetime('now')`,
        },
      });

    // 4. Merge user-supplied tags with any pre-existing tags on this ticker.
    const existingTags = await getTagsForTicker(normalized);
    const mergedTags = normalizeTagList([...existingTags, ...tagList]);
    await setTickerTags(normalized, mergedTags);

    // 5. Create new themes (skip duplicates by unique name).
    const createdThemeIds: number[] = [];
    for (const t of newThemes) {
      const themeName = t.name?.trim();
      if (!themeName) continue;
      try {
        const [inserted] = await db
          .insert(themes)
          .values({
            name: themeName,
            description: t.description?.trim() || "",
          })
          .returning({ id: themes.id });
        if (inserted) {
          createdThemeIds.push(inserted.id);
          // Attach any tags the new theme came with.
          if (Array.isArray(t.tags) && t.tags.length > 0) {
            await setThemeTags(inserted.id, normalizeTagList(t.tags));
          }
        }
      } catch (e) {
        const msg = String(e);
        if (msg.includes("UNIQUE")) {
          const existing = await db
            .select({ id: themes.id })
            .from(themes)
            .where(eq(themes.name, themeName))
            .limit(1);
          if (existing[0]) createdThemeIds.push(existing[0].id);
        } else {
          throw e;
        }
      }
    }

    // 6. Link to all themes (existing + newly created), skipping duplicates.
    const allThemeIds = Array.from(
      new Set([...requestedThemeIds, ...createdThemeIds]),
    );
    for (const themeId of allThemeIds) {
      const existingLink = await db
        .select({ id: themeStocks.id })
        .from(themeStocks)
        .where(
          and(
            eq(themeStocks.themeId, themeId),
            eq(themeStocks.ticker, normalized),
          ),
        )
        .limit(1);
      if (existingLink.length === 0) {
        await db.insert(themeStocks).values({
          themeId,
          ticker: normalized,
          status: "watching",
        });
      }
    }

    // 7. Revalidate cached pages.
    revalidatePath("/markets/scanner/stocks");
    revalidatePath("/markets/scanner/themes");
    revalidatePath("/markets/themes");
    revalidatePath(`/markets/ticker/${normalized}`);
    revalidateTag("themes");

    logger.info("api/tickers", "Ticker added/updated", {
      ticker: normalized,
      market,
      themeIds: allThemeIds,
      tagCount: mergedTags.length,
      created: isNewTicker,
    });

    return NextResponse.json(
      {
        ticker: normalized,
        original: tickerRaw.toUpperCase(),
        market,
        name: finalName,
        sector: finalSector,
        tags: mergedTags,
        themeIds: allThemeIds,
        created: isNewTicker,
      },
      { status: isNewTicker ? 201 : 200 },
    );
  } catch (e) {
    logger.error("api/tickers", "Failed to add ticker", {
      error: e,
      ticker: tickerRaw,
    });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
