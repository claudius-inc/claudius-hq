import type { Metadata } from "next";
import { db, tickerMetrics, themes, themeStocks, scannerUniverse } from "@/db";
import { desc } from "drizzle-orm";
import { getMomentumDeltas } from "@/lib/markets/momentum-gainers";
import { PageHero } from "@/components/PageHero";
import { ScanAge } from "../_components/ScanAge";
import { WatchlistMethodologyModal } from "./_components/WatchlistMethodologyModal";
import { AddTickerButton } from "./_components/AddTickerButton";
import {
  WatchlistTable,
  type WatchlistRow,
  type ThemeNameMap,
} from "./_components/WatchlistTable";

export const metadata: Metadata = {
  title: "Scanner – Stocks | Markets",
  description:
    "Watchlist of theme-tracked stocks with momentum + technical scores",
};

export const dynamic = "force-dynamic";

async function loadData(): Promise<{
  rows: WatchlistRow[];
  themeNames: ThemeNameMap;
  lastComputedAt: string | null;
}> {
  const [scoreRows, themeRows, universeRows, themeStockRows, deltas] =
    await Promise.all([
      db
        .select()
        .from(tickerMetrics)
        .orderBy(desc(tickerMetrics.momentumScore)),
      db.select({ id: themes.id, name: themes.name }).from(themes),
      db
        .select({
          ticker: scannerUniverse.ticker,
          name: scannerUniverse.name,
          market: scannerUniverse.market,
          notes: scannerUniverse.notes,
        })
        .from(scannerUniverse),
      db
        .select({
          ticker: themeStocks.ticker,
          themeId: themeStocks.themeId,
        })
        .from(themeStocks),
      getMomentumDeltas(),
    ]);

  // Per-ticker registry data (name, market, description) is sourced from
  // `scanner_universe` after the 0008 migration; metrics no longer carry it.
  type UniverseInfo = {
    name: string | null;
    market: string | null;
    notes: string | null;
  };
  const universeByTicker = new Map<string, UniverseInfo>();
  for (const u of universeRows) {
    universeByTicker.set(u.ticker, {
      name: u.name,
      market: u.market,
      notes: u.notes ?? null,
    });
  }

  // Theme membership joins live in `theme_stocks`. Use Set for dedup —
  // theme_stocks has no UNIQUE(theme_id, ticker) constraint, so duplicates
  // can occur and would otherwise produce duplicate React keys downstream.
  const themesByTicker = new Map<string, Set<number>>();
  for (const link of themeStockRows) {
    const set = themesByTicker.get(link.ticker) ?? new Set<number>();
    set.add(link.themeId);
    themesByTicker.set(link.ticker, set);
  }

  const rows: WatchlistRow[] = scoreRows.map((r) => {
    const universe = universeByTicker.get(r.ticker);
    return {
      ticker: r.ticker,
      name: universe?.name ?? r.ticker,
      market: (universe?.market ?? "US") as WatchlistRow["market"],
      price: r.price,
      momentumScore: r.momentumScore,
      technicalScore: r.technicalScore,
      priceChange1d: r.priceChange1d,
      priceChange1w: r.priceChange1w,
      priceChange1m: r.priceChange1m,
      priceChange3m: r.priceChange3m,
      themeIds: Array.from(themesByTicker.get(r.ticker) ?? []),
      dataQuality: r.dataQuality as WatchlistRow["dataQuality"],
      description: universe?.notes ?? null,
      momentumDelta: deltas.get(r.ticker)?.momentumDelta ?? null,
    };
  });

  const themeNames: ThemeNameMap = Object.fromEntries(
    themeRows.map((t) => [t.id, t.name]),
  );

  const lastComputedAt =
    scoreRows.length > 0
      ? scoreRows.reduce(
          (max, r) => (r.computedAt > max ? r.computedAt : max),
          scoreRows[0].computedAt,
        )
      : null;

  return { rows, themeNames, lastComputedAt };
}

export default async function ScannerStocksPage() {
  const { rows, themeNames, lastComputedAt } = await loadData();

  return (
    <>
      <PageHero
        title="Stocks Watchlist"
        badge={<WatchlistMethodologyModal />}
        actionSlot={
          <div className="flex items-center gap-3">
            {lastComputedAt && <ScanAge date={lastComputedAt} />}
            <AddTickerButton />
          </div>
        }
      />
      <WatchlistTable rows={rows} themeNames={themeNames} />
    </>
  );
}
