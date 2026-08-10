/**
 * Spotlight sectors — see docs/daily-note-spec.md §6.
 *
 * The standard sector tape (top-2 up / bottom-2 down) always renders; spotlight
 * only controls which sectors additionally get an expanded treatment: a
 * one-line callout in the Telegram push and a deep-dive block on the web note.
 * Toggled from /markets/notes/settings, stored in note_spotlight_config.
 *
 * GOLD is a pseudo-sector: it has no SPDR sector ETF, so it is driven off the
 * gold cross-asset print plus the GDX miners proxy.
 */
import { eq } from "drizzle-orm";
import { db, noteSpotlightConfig, NOTE_SPOTLIGHT_SECTORS } from "@/db";
import { logger } from "@/lib/logger";
import { fetchBatchQuotes } from "@/lib/scanner/yahoo-fetcher";
import type { SpotlightBlock, SectorPoint, CrossAssetPoint, DivergenceSector } from "@/lib/notes/types";

const SRC = "notes/spotlight";

/** Extra context tickers for the richer blocks (§6). */
const GOLD_PROXY = "GDX";

/**
 * Minimum quoted names before a sector's "leaders/laggards" claim is allowed.
 * The smallest S&P sector (Energy) holds ~21 names, so 5 is a low bar that
 * still catches a badly degraded quote batch.
 */
const MIN_SECTOR_COVERAGE = 5;

export async function loadEnabledSpotlights(): Promise<string[]> {
  try {
    const rows = await db
      .select()
      .from(noteSpotlightConfig)
      .where(eq(noteSpotlightConfig.enabled, true));
    // Order by the canonical sector list, not DB row order, so callouts appear
    // in the same sequence every day.
    const order = (s: string) => {
      const i = (NOTE_SPOTLIGHT_SECTORS as readonly string[]).indexOf(s);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return rows.map((r) => r.sector).sort((a, b) => order(a) - order(b));
  } catch (error) {
    logger.warn(SRC, "Spotlight config unavailable; no callouts", { error });
    return [];
  }
}

interface BuildInput {
  enabled: string[];
  sectors: SectorPoint[] | null;
  crossAsset: CrossAssetPoint[] | null;
  divergence: DivergenceSector[] | null;
  /** Constituent moves keyed by sector ETF, for leaders/laggards. */
  movers: Map<string, { ticker: string; changePct: number }[]>;
}

/**
 * Build one block per enabled sector that actually has something to say. A
 * sector with no data is dropped, never padded (§1a / §1 "cut quiet sections").
 */
export async function buildSpotlightBlocks(input: BuildInput): Promise<SpotlightBlock[]> {
  const { enabled, sectors, crossAsset, movers } = input;
  if (enabled.length === 0) return [];

  const out: SpotlightBlock[] = [];
  const sectorByEtf = new Map((sectors ?? []).map((s) => [s.etf, s]));

  // GOLD needs the miners proxy; fetch once, only if it's enabled.
  let gdxPct: number | null = null;
  if (enabled.includes("GOLD")) {
    try {
      const q = await fetchBatchQuotes([GOLD_PROXY]);
      const pct = q.get(GOLD_PROXY)?.regularMarketChangePercent;
      if (pct != null && Number.isFinite(pct)) gdxPct = Math.round(pct * 100) / 100;
    } catch (error) {
      logger.warn(SRC, "GDX quote failed", { error });
    }
  }

  for (const key of enabled) {
    if (key === "GOLD") {
      const gold = crossAsset?.find((c) => c.label === "Gold");
      if (!gold) continue;
      out.push({
        key,
        label: "Gold",
        headlinePct: gold.changePct,
        price: gold.price,
        leaders: [],
        laggards: [],
        proxy: gdxPct != null ? { ticker: GOLD_PROXY, changePct: gdxPct } : null,
      });
      continue;
    }

    const sector = sectorByEtf.get(key);
    if (!sector) continue;
    const names = movers.get(key) ?? [];
    const sorted = [...names].sort((a, b) => b.changePct - a.changePct);

    // "Leaders/laggards" is a claim about the whole sector, so it needs enough
    // of the sector to be true (§1a) — a partial quote failure must not let a
    // handful of names masquerade as the sector's extremes. Below the gate the
    // callout still renders, just as the sector's headline move alone.
    const enoughCoverage = sorted.length >= MIN_SECTOR_COVERAGE;
    const leaders = enoughCoverage ? sorted.slice(0, 2) : [];
    const leaderTickers = new Set(leaders.map((l) => l.ticker));
    // Never let the laggard be a name already shown as a leader.
    const laggards = enoughCoverage
      ? sorted.filter((n) => !leaderTickers.has(n.ticker)).slice(-1)
      : [];

    out.push({
      key,
      label: sector.name,
      headlinePct: sector.changePct,
      price: null,
      leaders,
      laggards,
      proxy: null,
    });
  }

  return out;
}
