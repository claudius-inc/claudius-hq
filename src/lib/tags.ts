import { eq, sql } from "drizzle-orm";
import { db, rawClient, tags as tagsTable, tickerTags, themeTags } from "@/db";

export interface TagWithCount {
  name: string;
  count: number;
}

/**
 * Look up an existing tag id by name (lowercased + trimmed).
 */
export async function findTagIdByName(name: string): Promise<number | null> {
  const norm = name.trim().toLowerCase();
  if (!norm) return null;
  const rows = await db
    .select({ id: tagsTable.id })
    .from(tagsTable)
    .where(eq(tagsTable.name, norm))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Insert (or fetch) a tag by name. Names are stored lowercased; trimmed.
 * Returns the tag id.
 */
export async function upsertTagByName(name: string): Promise<number | null> {
  const norm = name.trim().toLowerCase();
  if (!norm) return null;
  // Try insert first; if name conflict, fetch existing.
  try {
    const inserted = await db
      .insert(tagsTable)
      .values({ name: norm })
      .returning({ id: tagsTable.id });
    if (inserted[0]?.id) return inserted[0].id;
  } catch {
    // fall through to fetch
  }
  return findTagIdByName(norm);
}

/**
 * Replace the full set of tags attached to a ticker. Any tag in the new list
 * is upserted into `tags`; any old `ticker_tags` row not in the new list is
 * removed.
 */
export async function setTickerTags(ticker: string, tagNames: string[]) {
  const seen = new Set<string>();
  const ids: number[] = [];
  for (const raw of tagNames) {
    const norm = raw.trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const id = await upsertTagByName(norm);
    if (id) ids.push(id);
  }

  // Remove links not in the new set.
  if (ids.length === 0) {
    await db.delete(tickerTags).where(eq(tickerTags.ticker, ticker));
  } else {
    await db
      .delete(tickerTags)
      .where(
        sql`${tickerTags.ticker} = ${ticker} AND ${tickerTags.tagId} NOT IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
  }

  // Insert new links (skip duplicates via primary-key conflict).
  for (const tagId of ids) {
    await db
      .insert(tickerTags)
      .values({ ticker, tagId })
      .onConflictDoNothing();
  }
}

/**
 * Replace the full set of tags attached to a theme. Same shape as setTickerTags.
 */
export async function setThemeTags(themeId: number, tagNames: string[]) {
  const seen = new Set<string>();
  const ids: number[] = [];
  for (const raw of tagNames) {
    const norm = raw.trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const id = await upsertTagByName(norm);
    if (id) ids.push(id);
  }

  if (ids.length === 0) {
    await db.delete(themeTags).where(eq(themeTags.themeId, themeId));
  } else {
    await db
      .delete(themeTags)
      .where(
        sql`${themeTags.themeId} = ${themeId} AND ${themeTags.tagId} NOT IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
  }

  for (const tagId of ids) {
    await db
      .insert(themeTags)
      .values({ themeId, tagId })
      .onConflictDoNothing();
  }
}

/**
 * List all known tags with usage counts (occurrences in `ticker_tags` +
 * `theme_tags`). Returns sorted by count desc, then name asc.
 */
export async function listAllTags(): Promise<TagWithCount[]> {
  const result = await rawClient.execute(`
    SELECT
      t.name AS name,
      (
        (SELECT COUNT(*) FROM ticker_tags tt WHERE tt.tag_id = t.id) +
        (SELECT COUNT(*) FROM theme_tags th WHERE th.tag_id = t.id)
      ) AS count
    FROM tags t
    ORDER BY count DESC, t.name ASC
  `);
  return result.rows.map((r) => ({
    name: String(r.name),
    count: Number(r.count),
  }));
}

/**
 * Get the lowercased tag names attached to a ticker.
 */
export async function getTagsForTicker(ticker: string): Promise<string[]> {
  const rows = await db
    .select({ name: tagsTable.name })
    .from(tickerTags)
    .innerJoin(tagsTable, eq(tagsTable.id, tickerTags.tagId))
    .where(eq(tickerTags.ticker, ticker));
  return rows.map((r) => r.name);
}

/**
 * Get the lowercased tag names attached to a theme.
 */
export async function getTagsForTheme(themeId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tagsTable.name })
    .from(themeTags)
    .innerJoin(tagsTable, eq(tagsTable.id, themeTags.tagId))
    .where(eq(themeTags.themeId, themeId));
  return rows.map((r) => r.name);
}
