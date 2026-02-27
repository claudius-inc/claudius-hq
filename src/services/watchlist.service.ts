/**
 * Watchlist Service
 * Handles watchlist CRUD operations
 */
import { db, watchlist } from "@/db";
import { desc, eq } from "drizzle-orm";
import type { WatchlistItem, NewWatchlistItem, WatchlistStatus } from "@/db/schema";

// ============================================================================
// Watchlist
// ============================================================================

export async function listWatchlistItems(): Promise<WatchlistItem[]> {
  return db.select().from(watchlist).orderBy(desc(watchlist.addedAt));
}

export async function getWatchlistItem(id: number): Promise<WatchlistItem | null> {
  const [item] = await db.select().from(watchlist).where(eq(watchlist.id, id));
  return item || null;
}

export async function getWatchlistItemByTicker(ticker: string): Promise<WatchlistItem | null> {
  const [item] = await db
    .select()
    .from(watchlist)
    .where(eq(watchlist.ticker, ticker.toUpperCase()));
  return item || null;
}

export interface CreateWatchlistItemInput {
  ticker: string;
  targetPrice?: number | null;
  notes?: string | null;
  status?: WatchlistStatus;
}

export interface CreateWatchlistResult {
  item: WatchlistItem | null;
  error?: "already_exists";
}

export async function createWatchlistItem(
  input: CreateWatchlistItemInput
): Promise<CreateWatchlistResult> {
  const upperTicker = input.ticker.toUpperCase().trim();

  // Check if already exists
  const existing = await getWatchlistItemByTicker(upperTicker);
  if (existing) {
    return { item: null, error: "already_exists" };
  }

  const [newItem] = await db
    .insert(watchlist)
    .values({
      ticker: upperTicker,
      targetPrice: input.targetPrice ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "watching",
    })
    .returning();

  return { item: newItem };
}

export interface UpdateWatchlistItemInput {
  targetPrice?: number | null;
  notes?: string | null;
  status?: WatchlistStatus;
}

export async function updateWatchlistItem(
  id: number,
  input: UpdateWatchlistItemInput
): Promise<boolean> {
  const updateData: Partial<typeof watchlist.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.targetPrice !== undefined) {
    updateData.targetPrice = input.targetPrice;
  }
  if (input.notes !== undefined) {
    updateData.notes = input.notes;
  }
  if (input.status !== undefined) {
    updateData.status = input.status;
  }

  await db.update(watchlist).set(updateData).where(eq(watchlist.id, id));
  return true;
}

export async function deleteWatchlistItem(id: number): Promise<boolean> {
  const [existing] = await db
    .select({ id: watchlist.id })
    .from(watchlist)
    .where(eq(watchlist.id, id));

  if (!existing) {
    return false;
  }

  await db.delete(watchlist).where(eq(watchlist.id, id));
  return true;
}

export async function deleteWatchlistItemByTicker(ticker: string): Promise<boolean> {
  const item = await getWatchlistItemByTicker(ticker);
  if (!item) {
    return false;
  }

  await db.delete(watchlist).where(eq(watchlist.id, item.id));
  return true;
}
