/**
 * Themes Service
 * Handles investment themes and theme stocks
 */
import { db, themes, themeStocks } from "@/db";
import { eq, desc } from "drizzle-orm";
import type { Theme, NewTheme, ThemeStock, NewThemeStock, ThemeStockStatus } from "@/db/schema";

// ============================================================================
// Themes
// ============================================================================

export async function listThemes(): Promise<Theme[]> {
  return db.select().from(themes).orderBy(themes.name);
}

export async function getTheme(id: number): Promise<Theme | null> {
  const [theme] = await db.select().from(themes).where(eq(themes.id, id));
  return theme || null;
}

export async function getThemeByName(name: string): Promise<Theme | null> {
  const [theme] = await db
    .select()
    .from(themes)
    .where(eq(themes.name, name.trim()));
  return theme || null;
}

export interface CreateThemeInput {
  name: string;
  description?: string;
}

export interface CreateThemeResult {
  theme: Theme | null;
  error?: "already_exists";
}

export async function createTheme(input: CreateThemeInput): Promise<CreateThemeResult> {
  try {
    const [newTheme] = await db
      .insert(themes)
      .values({
        name: input.name.trim(),
        description: input.description?.trim() || "",
      })
      .returning();
    return { theme: newTheme };
  } catch (e) {
    const error = String(e);
    if (error.includes("UNIQUE constraint")) {
      return { theme: null, error: "already_exists" };
    }
    throw e;
  }
}

export interface UpdateThemeInput {
  name?: string;
  description?: string;
}

export async function updateTheme(id: number, input: UpdateThemeInput): Promise<boolean> {
  const updateData: Partial<typeof themes.$inferInsert> = {};

  if (input.name !== undefined) {
    updateData.name = input.name.trim();
  }
  if (input.description !== undefined) {
    updateData.description = input.description.trim();
  }

  if (Object.keys(updateData).length === 0) {
    return false;
  }

  await db.update(themes).set(updateData).where(eq(themes.id, id));
  return true;
}

export async function deleteTheme(id: number): Promise<boolean> {
  const [existing] = await db.select({ id: themes.id }).from(themes).where(eq(themes.id, id));

  if (!existing) {
    return false;
  }

  // themeStocks will be cascade deleted due to FK constraint
  await db.delete(themes).where(eq(themes.id, id));
  return true;
}

// ============================================================================
// Theme Stocks
// ============================================================================

export async function listThemeStocks(themeId?: number): Promise<ThemeStock[]> {
  if (themeId) {
    return db
      .select()
      .from(themeStocks)
      .where(eq(themeStocks.themeId, themeId))
      .orderBy(desc(themeStocks.addedAt));
  }
  return db.select().from(themeStocks).orderBy(desc(themeStocks.addedAt));
}

export async function getThemeStock(id: number): Promise<ThemeStock | null> {
  const [stock] = await db.select().from(themeStocks).where(eq(themeStocks.id, id));
  return stock || null;
}

export async function getThemeStocksByTicker(ticker: string): Promise<ThemeStock[]> {
  return db
    .select()
    .from(themeStocks)
    .where(eq(themeStocks.ticker, ticker.toUpperCase()));
}

export interface CreateThemeStockInput {
  themeId: number;
  ticker: string;
  targetPrice?: number | null;
  status?: ThemeStockStatus;
  notes?: string | null;
}

export async function createThemeStock(input: CreateThemeStockInput): Promise<ThemeStock> {
  const [newStock] = await db
    .insert(themeStocks)
    .values({
      themeId: input.themeId,
      ticker: input.ticker.toUpperCase().trim(),
      targetPrice: input.targetPrice ?? null,
      status: input.status ?? "watching",
      notes: input.notes ?? null,
    })
    .returning();

  return newStock;
}

export interface UpdateThemeStockInput {
  targetPrice?: number | null;
  status?: ThemeStockStatus;
  notes?: string | null;
}

export async function updateThemeStock(
  id: number,
  input: UpdateThemeStockInput
): Promise<boolean> {
  const updateData: Partial<typeof themeStocks.$inferInsert> = {};

  if (input.targetPrice !== undefined) {
    updateData.targetPrice = input.targetPrice;
  }
  if (input.status !== undefined) {
    updateData.status = input.status;
  }
  if (input.notes !== undefined) {
    updateData.notes = input.notes;
  }

  if (Object.keys(updateData).length === 0) {
    return false;
  }

  await db.update(themeStocks).set(updateData).where(eq(themeStocks.id, id));
  return true;
}

export async function deleteThemeStock(id: number): Promise<boolean> {
  const [existing] = await db
    .select({ id: themeStocks.id })
    .from(themeStocks)
    .where(eq(themeStocks.id, id));

  if (!existing) {
    return false;
  }

  await db.delete(themeStocks).where(eq(themeStocks.id, id));
  return true;
}

// ============================================================================
// Aggregations
// ============================================================================

export interface ThemeWithStocks extends Theme {
  stocks: string[];
}

export async function listThemesWithStocks(): Promise<ThemeWithStocks[]> {
  const allThemes = await listThemes();
  const allStocks = await listThemeStocks();

  // Group stocks by theme
  const stocksByTheme = new Map<number, string[]>();
  for (const stock of allStocks) {
    const existing = stocksByTheme.get(stock.themeId) || [];
    existing.push(stock.ticker);
    stocksByTheme.set(stock.themeId, existing);
  }

  return allThemes.map((theme) => ({
    ...theme,
    stocks: stocksByTheme.get(theme.id) || [],
  }));
}

export async function getUniqueThemeTickers(): Promise<string[]> {
  const allStocks = await listThemeStocks();
  return Array.from(new Set(allStocks.map((s) => s.ticker)));
}
