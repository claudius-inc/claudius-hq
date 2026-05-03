import type { Metadata } from "next";
import { db, watchlistScores, themes } from "@/db";
import { desc } from "drizzle-orm";
import { PageHero } from "@/components/PageHero";
import { ScanAge } from "../_components/ScanAge";
import { WatchlistMethodologyModal } from "./_components/WatchlistMethodologyModal";
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

function safeParseThemeIds(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

async function loadData(): Promise<{
  rows: WatchlistRow[];
  themeNames: ThemeNameMap;
  lastComputedAt: string | null;
}> {
  const [scoreRows, themeRows] = await Promise.all([
    db.select().from(watchlistScores).orderBy(desc(watchlistScores.momentumScore)),
    db.select({ id: themes.id, name: themes.name }).from(themes),
  ]);

  const rows: WatchlistRow[] = scoreRows.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    market: r.market as WatchlistRow["market"],
    price: r.price,
    momentumScore: r.momentumScore,
    technicalScore: r.technicalScore,
    priceChange1w: r.priceChange1w,
    priceChange1m: r.priceChange1m,
    priceChange3m: r.priceChange3m,
    themeIds: safeParseThemeIds(r.themeIds),
    dataQuality: r.dataQuality as WatchlistRow["dataQuality"],
  }));

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
        actionSlot={lastComputedAt ? <ScanAge date={lastComputedAt} /> : undefined}
      />
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <WatchlistTable rows={rows} themeNames={themeNames} />
      </div>
    </>
  );
}
