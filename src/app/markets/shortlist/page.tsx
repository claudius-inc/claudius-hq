// Deliberately no venue or screen imports: this page reads the database only,
// so it must not pull in the Binance client or the screen's dependency tree.
import { rawClient } from "@/db";
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
  vol_pctl: number | null;
  vwap_dist_pct: number | null;
  oi_change_pct: number | null;
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
           change_pct, vol_pctl, vwap_dist_pct, oi_change_pct, as_of, run_date
    FROM perp_convergence_picks
    WHERE reported = 1
      AND run_date = (SELECT MAX(run_date) FROM perp_convergence_picks WHERE reported = 1)
    ORDER BY side DESC, rank ASC
  `);
  return res.rows as unknown as PickRow[];
}

/** Stored candles for one run, keyed by symbol. */
async function loadChartBars(
  runDate: string,
): Promise<Map<string, { bars: CompactBar[]; qvwap: number | null }>> {
  const out = new Map<string, { bars: CompactBar[]; qvwap: number | null }>();
  if (!runDate) return out;

  const res = await rawClient.execute({
    sql: "SELECT symbol, bars, qvwap FROM perp_chart_bars WHERE run_date = ?",
    args: [runDate] as never[],
  });

  for (const row of res.rows) {
    try {
      out.set(String(row.symbol), {
        bars: JSON.parse(String(row.bars)) as CompactBar[],
        qvwap: row.qvwap === null ? null : Number(row.qvwap),
      });
    } catch {
      // A malformed blob costs one chart, not the page.
    }
  }
  return out;
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

  // Candles come from the database, never from the venue.
  //
  // Binance answers HTTP 451 to restricted regions, which includes US-hosted
  // serverless runtimes — a render-time fetch here works locally and fails in
  // production for reasons no code path can fix. The pipeline runs from a
  // permitted region and writes the bars it used, so this page has no
  // geographic dependency at all.
  let barsBySymbol = new Map<string, { bars: CompactBar[]; qvwap: number | null }>();
  try {
    barsBySymbol = await loadChartBars(rows[0]?.run_date ?? "");
  } catch (err) {
    logger.error("markets/shortlist", "Failed to load chart bars", { error: err });
  }

  const charts: ShortlistChart[] = [];
  for (const r of rows) {
    const stored = barsBySymbol.get(r.symbol);
    if (stored && stored.bars.length) {
      charts.push({
        base: r.base,
        symbol: r.symbol,
        side: r.side === "short" ? "short" : "long",
        category: r.category,
        score: r.score,
        maxScore: r.max_score,
        factors: factorInitials(r.factors, r.score, r.max_score),
        rsi: r.rsi,
        volPctl: r.vol_pctl,
        changePct: r.change_pct,
        vwapDistPct: r.vwap_dist_pct,
        oiChangePct: r.oi_change_pct,
        qvwap: stored.qvwap,
        bars: stored.bars,
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
        // Two distinct failures, two distinct messages. Collapsing them into
        // "nothing recorded yet" was misleading: picks present with no candles
        // means the screen ran but did not write its bars, which is a different
        // thing to go and fix than the screen never having run.
        <p className="text-sm text-neutral-500">
          {rows.length === 0
            ? "No shortlist recorded yet. The screen runs once a day."
            : `${rows.length} names were shortlisted for ${rows[0].run_date}, but no candles ` +
              "were stored for that run. Re-run the screen to record them."}
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
