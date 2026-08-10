import { rawClient } from "@/db";
import { binanceVenue } from "@/lib/markets/perp-venues";
import { quarterlyVwap } from "@/lib/markets/convergence-screen";
import { logger } from "@/lib/logger";
import { PageHero } from "@/components/PageHero";
import ChartGrid from "./_components/ChartGrid";
import type { CompactBar, ShortlistChart } from "./_lib/types";

/**
 * External market data with a DB read on top, so this tracks the ISR band for
 * "DB data with external enrichment". The screen itself only runs once a day;
 * five minutes keeps the candles current without hammering the venue.
 */
export const revalidate = 300;

/** 4h bars per chart — ~30 days, enough to read structure without noise. */
const CHART_BARS = 180;

interface PickRow {
  symbol: string;
  base: string;
  side: string;
  category: string;
  score: number;
  max_score: number;
  factors: string | null;
  rsi: number | null;
  change_pct: number | null;
  as_of: string | null;
  run_date: string;
}

/**
 * The most recent day that actually reported picks.
 *
 * Not `date('now')`: the pipeline runs at 00:10 UTC, so between midnight and
 * the run there are no rows for today and a hard-coded today would render an
 * empty page every night. Taking the latest run_date that has reported rows
 * shows yesterday's shortlist until the new one lands.
 */
async function loadLatestPicks(): Promise<PickRow[]> {
  const res = await rawClient.execute(`
    SELECT symbol, base, side, category, score, max_score, factors, rsi,
           change_pct, as_of, run_date
    FROM perp_convergence_picks
    WHERE reported = 1
      AND run_date = (SELECT MAX(run_date) FROM perp_convergence_picks WHERE reported = 1)
    ORDER BY side DESC, rank ASC
  `);
  return res.rows as unknown as PickRow[];
}

/** Renders the stored factor JSON as initials, `Q` first (it is worth 2). */
function factorInitials(json: string | null, score: number, maxScore: number): string {
  if (!json) return "";
  try {
    const f = JSON.parse(json) as Record<string, boolean>;
    const on: string[] = [];
    // A weighted score above the plain factor count means VWAP contributed.
    const plain = Object.values(f).filter(Boolean).length;
    if (score - plain >= 2 || maxScore - score <= 0) on.push("Q");
    if (f.trend) on.push("T");
    if (f.pullback) on.push("P");
    if (f.support) on.push("S");
    if (f.proximity) on.push("X");
    if (f.vsa) on.push("V");
    return on.join("");
  } catch {
    return "";
  }
}

export default async function ShortlistPage() {
  let rows: PickRow[] = [];
  try {
    rows = await loadLatestPicks();
  } catch (err) {
    logger.error("markets/shortlist", "Failed to load shortlist picks", { error: err });
  }

  const charts: ShortlistChart[] = [];
  // Sequential rather than Promise.all: 16 symbols against a venue with an IP
  // weight budget, on a page that revalidates every five minutes.
  for (const r of rows) {
    try {
      const bars = await binanceVenue.fetchBars(r.symbol, "4h", CHART_BARS + 1);
      if (!bars.length) continue;
      charts.push({
        base: r.base,
        symbol: r.symbol,
        side: r.side === "short" ? "short" : "long",
        category: r.category,
        score: r.score,
        maxScore: r.max_score,
        factors: factorInitials(r.factors, r.score, r.max_score),
        rsi: r.rsi,
        volPctl: null,
        changePct: r.change_pct,
        vwapDistPct: null,
        oiChangePct: null,
        qvwap: quarterlyVwap(bars),
        bars: bars.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v] as CompactBar),
      });
    } catch (err) {
      logger.warn("markets/shortlist", "Bar fetch failed; chart omitted", {
        symbol: r.symbol,
        error: err,
      });
    }
  }

  const asOf = rows[0]?.as_of ? `${rows[0].as_of.replace("T", " ").slice(0, 16)}Z` : null;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 sm:px-6">
      <PageHero
        title="Shortlist"
        subtitle="Every perp the screen surfaced today, as 4h candles with quarterly anchored VWAP. The screen narrows the field; the read is yours."
      />

      <p className="mb-6 font-mono text-[11px] uppercase tracking-wider text-neutral-500">
        {asOf ? `As of ${asOf}` : "Awaiting first run"}
        {charts.length > 0 && ` · ${charts.length} names · 4h`}
      </p>

      {charts.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No shortlist recorded yet. The screen runs daily at 00:10 UTC.
        </p>
      ) : (
        <ChartGrid charts={charts} />
      )}

      <div className="mt-10 border-t border-neutral-200 pt-5 font-mono text-[10.5px] leading-relaxed text-neutral-500 dark:border-neutral-800">
        <p className="mb-1">
          Q quarterly VWAP (2pts) · T trend · P pullback · S support · X extreme · V volume
        </p>
        <p>
          Purple dashed line is quarterly anchored VWAP. High scores select coiled names, so
          expect most of these to be quiet — the score gates the list, open interest orders it.
        </p>
      </div>
    </div>
  );
}
