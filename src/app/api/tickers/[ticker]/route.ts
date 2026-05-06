import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  db,
  scannerUniverse,
  themes,
  themeStocks,
  tickerMetrics,
  tickerTags,
  portfolioHoldings,
} from "@/db";
import { getTagsForTicker, setTickerTags, setThemeTags } from "@/lib/markets/tags";
import {
  type TickerProfile,
  columnsToProfile,
  profileToColumns,
} from "@/lib/ai/ticker-ai";
import { logger } from "@/lib/logger";

interface NewThemeInput {
  name: string;
  description?: string;
  tags?: string[];
}

interface PatchTickerBody {
  name?: string | null;
  sector?: string | null;
  notes?: string | null;
  tags?: string[];
  themeIds?: number[];
  newThemes?: NewThemeInput[];
  // When present, replaces the full profile. Pass an empty profile to clear.
  profile?: TickerProfile;
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

// GET /api/tickers/:ticker — returns the editable fields and current
// tag/theme membership for the modal pre-fill. Does NOT hit Yahoo.
export async function GET(
  _request: NextRequest,
  { params }: { params: { ticker: string } },
) {
  const ticker = decodeURIComponent(params.ticker).trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  try {
    const [universe, tags, themeLinks] = await Promise.all([
      db
        .select()
        .from(scannerUniverse)
        .where(eq(scannerUniverse.ticker, ticker))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      getTagsForTicker(ticker),
      db
        .select({ themeId: themeStocks.themeId })
        .from(themeStocks)
        .where(eq(themeStocks.ticker, ticker)),
    ]);

    if (!universe) {
      return NextResponse.json(
        { error: `Ticker "${ticker}" not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ticker: universe.ticker,
      market: universe.market,
      name: universe.name,
      sector: universe.sector,
      notes: universe.notes,
      tags,
      themeIds: themeLinks.map((t) => t.themeId),
      profile: columnsToProfile(universe),
      profileGeneratedAt: universe.profileGeneratedAt,
    });
  } catch (e) {
    logger.error("api/tickers/[ticker]", "GET failed", { error: e, ticker });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/tickers/:ticker — updates editable fields. The ticker symbol
// and market are immutable here; if you need to change those, delete and
// re-add. No Yahoo lookup happens — the universe row already exists.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { ticker: string } },
) {
  const ticker = decodeURIComponent(params.ticker).trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  let body: PatchTickerBody;
  try {
    body = (await request.json()) as PatchTickerBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const existing = await db
      .select({ id: scannerUniverse.id })
      .from(scannerUniverse)
      .where(eq(scannerUniverse.ticker, ticker))
      .limit(1);
    if (existing.length === 0) {
      return NextResponse.json(
        { error: `Ticker "${ticker}" not found` },
        { status: 404 },
      );
    }

    // 1. Update editable scanner_universe fields. Only set what was provided —
    // `undefined` means "leave alone"; `null`/empty string clears the value.
    const updates: Record<string, unknown> = {
      updatedAt: sql`datetime('now')`,
    };
    if (body.name !== undefined) {
      const trimmed = typeof body.name === "string" ? body.name.trim() : "";
      updates.name = trimmed || null;
    }
    if (body.sector !== undefined) {
      const trimmed = typeof body.sector === "string" ? body.sector.trim() : "";
      updates.sector = trimmed || null;
    }
    if (body.notes !== undefined) {
      const trimmed = typeof body.notes === "string" ? body.notes.trim() : "";
      updates.notes = trimmed || null;
    }
    // Profile fields are replaced wholesale when provided. Stamping
    // profile_generated_at on user edits too is intentional: it's a
    // "last-touched" marker rather than "last-AI-touched", so the backfill
    // script's `IS NULL` filter doesn't redraft over manual edits.
    if (body.profile !== undefined) {
      const cols = profileToColumns(body.profile);
      Object.assign(updates, cols);
      updates.profileGeneratedAt = sql`datetime('now')`;
    }
    await db
      .update(scannerUniverse)
      .set(updates)
      .where(eq(scannerUniverse.ticker, ticker));

    // 2. Replace tag set if provided.
    if (body.tags !== undefined) {
      await setTickerTags(ticker, normalizeTagList(body.tags));
    }

    // 3. Create any new themes the user typed.
    const createdThemeIds: number[] = [];
    const newThemes = Array.isArray(body.newThemes) ? body.newThemes : [];
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
          if (Array.isArray(t.tags) && t.tags.length > 0) {
            await setThemeTags(inserted.id, normalizeTagList(t.tags));
          }
        }
      } catch (e) {
        const msg = String(e);
        if (msg.includes("UNIQUE")) {
          const existingTheme = await db
            .select({ id: themes.id })
            .from(themes)
            .where(eq(themes.name, themeName))
            .limit(1);
          if (existingTheme[0]) createdThemeIds.push(existingTheme[0].id);
        } else {
          throw e;
        }
      }
    }

    // 4. Reconcile theme membership if provided. Treat the union of
    // (themeIds + createdThemeIds) as the desired membership: links not in
    // the set are removed; links in the set are inserted (skip dupes).
    if (body.themeIds !== undefined || newThemes.length > 0) {
      const requested = Array.isArray(body.themeIds)
        ? body.themeIds.filter((n) => Number.isInteger(n))
        : [];
      const desired = Array.from(new Set([...requested, ...createdThemeIds]));

      // Remove links not in `desired`.
      if (desired.length === 0) {
        await db
          .delete(themeStocks)
          .where(eq(themeStocks.ticker, ticker));
      } else {
        await db
          .delete(themeStocks)
          .where(
            and(
              eq(themeStocks.ticker, ticker),
              sql`${themeStocks.themeId} NOT IN (${sql.join(
                desired.map((id) => sql`${id}`),
                sql`, `,
              )})`,
            ),
          );
      }

      // Insert any missing links.
      if (desired.length > 0) {
        const existingLinks = await db
          .select({ themeId: themeStocks.themeId })
          .from(themeStocks)
          .where(
            and(
              eq(themeStocks.ticker, ticker),
              inArray(themeStocks.themeId, desired),
            ),
          );
        const existingIds = new Set(existingLinks.map((l) => l.themeId));
        for (const themeId of desired) {
          if (existingIds.has(themeId)) continue;
          await db.insert(themeStocks).values({
            themeId,
            ticker,
            status: "watching",
          });
        }
      }
    }

    revalidatePath("/markets/scanner/stocks");
    revalidatePath("/markets/scanner/themes");
    revalidatePath("/markets/themes");
    revalidatePath(`/markets/ticker/${ticker}`);
    revalidateTag("themes");

    logger.info("api/tickers/[ticker]", "Ticker updated", { ticker });

    const refreshedTags = await getTagsForTicker(ticker);
    const refreshedThemeLinks = await db
      .select({ themeId: themeStocks.themeId })
      .from(themeStocks)
      .where(eq(themeStocks.ticker, ticker));
    const refreshedRow = await db
      .select()
      .from(scannerUniverse)
      .where(eq(scannerUniverse.ticker, ticker))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    return NextResponse.json({
      ticker,
      tags: refreshedTags,
      themeIds: refreshedThemeLinks.map((t) => t.themeId),
      profile: refreshedRow ? columnsToProfile(refreshedRow) : null,
      profileGeneratedAt: refreshedRow?.profileGeneratedAt ?? null,
    });
  } catch (e) {
    logger.error("api/tickers/[ticker]", "PATCH failed", { error: e, ticker });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/tickers/:ticker — removes the ticker from the registry, its
// computed metrics, its tag links, and any theme memberships. Refuses with
// 409 if there's an active portfolio_holding so we never silently destroy a
// position the user is tracking. Leaves trade_journal and stock_reports
// alone; those are historical/research records that stand on their own.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { ticker: string } },
) {
  const ticker = decodeURIComponent(params.ticker).trim().toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  try {
    const existing = await db
      .select({ id: scannerUniverse.id })
      .from(scannerUniverse)
      .where(eq(scannerUniverse.ticker, ticker))
      .limit(1);
    if (existing.length === 0) {
      return NextResponse.json(
        { error: `Ticker "${ticker}" not found` },
        { status: 404 },
      );
    }

    const holding = await db
      .select({ id: portfolioHoldings.id })
      .from(portfolioHoldings)
      .where(eq(portfolioHoldings.ticker, ticker))
      .limit(1);
    if (holding.length > 0) {
      return NextResponse.json(
        {
          error: `${ticker} has an active portfolio holding. Remove the holding before deleting the ticker.`,
        },
        { status: 409 },
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(themeStocks).where(eq(themeStocks.ticker, ticker));
      await tx.delete(tickerTags).where(eq(tickerTags.ticker, ticker));
      await tx.delete(tickerMetrics).where(eq(tickerMetrics.ticker, ticker));
      await tx.delete(scannerUniverse).where(eq(scannerUniverse.ticker, ticker));
    });

    revalidatePath("/markets/scanner/stocks");
    revalidatePath("/markets/scanner/themes");
    revalidatePath("/markets/themes");
    revalidatePath(`/markets/ticker/${ticker}`);
    revalidateTag("themes");

    logger.info("api/tickers/[ticker]", "Ticker deleted", { ticker });

    return NextResponse.json({ ticker, deleted: true });
  } catch (e) {
    logger.error("api/tickers/[ticker]", "DELETE failed", { error: e, ticker });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
