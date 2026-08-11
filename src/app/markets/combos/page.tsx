// Reads only the database, like every other perp page: Binance answers HTTP 451
// to datacenter IP ranges, so nothing rendered here may call the venue. The
// research scripts run where the data is and write what this page needs.
import { rawClient } from "@/db";
import { logger } from "@/lib/logger";
import { PageHero } from "@/components/PageHero";
import ComboExplorer from "./_components/ComboExplorer";
import type { ComboResultRow } from "./_lib/types";

/** DB-only data, changed by a manual research run. On-demand is overkill; this
 *  matches the "internal DB data" band with a floor so a stale table cannot
 *  outlive a re-export by long. */
export const revalidate = 300;

/** The set the daily report currently ranks by. */
const SHIPPED = ["rvol", "rev6", "fundingAbs"];

async function loadResults(): Promise<ComboResultRow[]> {
  const res = await rawClient.execute(`
    SELECT run_date, horizon, objective, signals, k, effective_rank,
           train_value, holdout_value, holdout_ic, holdout_ic_t,
           holdout_capture, holdout_basket, holdout_basket_t,
           holdout_abs, baseline_abs, n_timestamps, is_frontier, is_champion
    FROM perp_combo_results
    WHERE run_date = (SELECT MAX(run_date) FROM perp_combo_results)
    ORDER BY is_champion DESC, is_frontier DESC, train_value DESC
    LIMIT 250
  `);

  return res.rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    const num = (k: string) => (row[k] === null ? null : Number(row[k]));
    return {
      runDate: String(row.run_date),
      horizon: Number(row.horizon),
      objective: String(row.objective),
      signals: String(row.signals),
      k: Number(row.k),
      effectiveRank: num("effective_rank"),
      trainValue: num("train_value"),
      holdoutValue: num("holdout_value"),
      holdoutIc: num("holdout_ic"),
      holdoutIcT: num("holdout_ic_t"),
      holdoutCapture: num("holdout_capture"),
      holdoutBasket: num("holdout_basket"),
      holdoutBasketT: num("holdout_basket_t"),
      holdoutAbs: num("holdout_abs"),
      baselineAbs: num("baseline_abs"),
      nTimestamps: num("n_timestamps"),
      isFrontier: Number(row.is_frontier) === 1,
      isChampion: Number(row.is_champion) === 1,
    };
  });
}

const fmt = (v: number | null, d = 3) =>
  v === null || !Number.isFinite(v) ? "—" : v.toFixed(d);

export default async function CombosPage() {
  let rows: ComboResultRow[] = [];
  try {
    rows = await loadResults();
  } catch (err) {
    logger.error("markets/combos", "Failed to load combo results", { error: err });
  }

  const frontier = rows.filter((r) => r.isFrontier).sort((a, b) => a.k - b.k);
  const meta = rows[0];

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 sm:px-6">
      <PageHero
        title="Combinations"
        subtitle="Tick indicators and see how the combination would have ordered the cross-section. The explorer finds candidates; the research run confirms them."
      />

      <ComboExplorer shipped={SHIPPED} />

      {/* ── the ledger ── */}
      <div className="mt-12">
        <h2 className="mb-1 text-lg font-medium">Confirmed runs</h2>
        <p className="mb-4 max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
          Combinations evaluated by the full search, against the sealed holdout.{" "}
          {meta
            ? `Latest: ${meta.runDate}, horizon ${meta.horizon} bars, objective ${meta.objective}.`
            : ""}
        </p>

        {frontier.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 font-mono text-[10.5px] uppercase tracking-wider text-neutral-500">
              Parsimony frontier — best set at each size
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse font-mono text-[11.5px]">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
                    <th className="py-1.5 pr-3 font-normal">k</th>
                    <th className="py-1.5 pr-3 font-normal">eff. rank</th>
                    <th className="py-1.5 pr-3 font-normal">set</th>
                    <th className="py-1.5 pr-3 text-right font-normal">train</th>
                    <th className="py-1.5 pr-3 text-right font-normal">holdout</th>
                  </tr>
                </thead>
                <tbody>
                  {frontier.map((r) => (
                    <tr
                      key={r.signals}
                      className="border-b border-neutral-100 dark:border-neutral-900"
                    >
                      <td className="py-1.5 pr-3">{r.k}</td>
                      <td className="py-1.5 pr-3 text-neutral-500">{fmt(r.effectiveRank, 2)}</td>
                      <td className="py-1.5 pr-3">
                        {r.signals.split("|").join(" + ")}
                        {r.isChampion && (
                          <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-white dark:bg-neutral-100 dark:text-neutral-900">
                            champion
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{fmt(r.trainValue, 4)}</td>
                      <td className="py-1.5 pr-3 text-right">{fmt(r.holdoutValue, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-neutral-500">
              Holdout figures in this table are SELECTION-CONTAMINATED: the holdout is read once per
              row, so the column is a max-over-k statistic rather than an unbiased estimate. Only the
              champion — whose size was chosen on train before the holdout was opened — is an honest
              out-of-sample number.
            </p>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No search has been recorded yet. Run{" "}
            <code>npx tsx scripts/research/run-perp-combo-search.ts</code>, then{" "}
            <code>npx tsx scripts/research/export-combo-explorer.ts</code>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse font-mono text-[11.5px]">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
                  <th className="py-1.5 pr-3 font-normal">set</th>
                  <th className="py-1.5 pr-3 text-right font-normal">k</th>
                  <th className="py-1.5 pr-3 text-right font-normal">eff</th>
                  <th className="py-1.5 pr-3 text-right font-normal">IC</th>
                  <th className="py-1.5 pr-3 text-right font-normal">t</th>
                  <th className="py-1.5 pr-3 text-right font-normal">capture</th>
                  <th className="py-1.5 pr-3 text-right font-normal">basket%</th>
                  <th className="py-1.5 pr-3 text-right font-normal">abs%</th>
                  <th className="py-1.5 pr-3 text-right font-normal">base%</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r) => (
                  <tr
                    key={r.signals}
                    className={
                      "border-b border-neutral-100 dark:border-neutral-900 " +
                      (r.isChampion ? "bg-neutral-50 dark:bg-neutral-900/50" : "")
                    }
                  >
                    <td className="py-1.5 pr-3">{r.signals.split("|").join(" + ")}</td>
                    <td className="py-1.5 pr-3 text-right">{r.k}</td>
                    <td className="py-1.5 pr-3 text-right text-neutral-500">
                      {fmt(r.effectiveRank, 2)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{fmt(r.holdoutIc)}</td>
                    <td
                      className={
                        "py-1.5 pr-3 text-right " +
                        (r.holdoutIcT !== null && Math.abs(r.holdoutIcT) > 2.807
                          ? "font-semibold"
                          : "text-neutral-500")
                      }
                    >
                      {fmt(r.holdoutIcT, 2)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{fmt(r.holdoutCapture, 2)}×</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(r.holdoutBasket, 3)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(r.holdoutAbs, 3)}</td>
                    <td className="py-1.5 pr-3 text-right text-neutral-500">
                      {fmt(r.baselineAbs, 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-10 border-t border-neutral-200 pt-5 font-mono text-[10.5px] leading-relaxed text-neutral-500 dark:border-neutral-800">
        <p className="mb-1">
          Excess is gross of fees — a cross-sectionally constant round-trip fee is removed exactly by
          demeaning, so only funding survives into it. Slippage is not modelled.
        </p>
        <p>
          Findings, limits and the procedure for adding an experiment:{" "}
          <code>docs/perp-signal-research.md</code>
        </p>
      </div>
    </div>
  );
}
