/**
 * What is each indicator worth ON ITS OWN, before any combination?
 *
 * Run with:
 *   npx tsx scripts/research/run-perp-signal-study.ts
 *   npx tsx scripts/research/run-perp-signal-study.ts --horizon 18
 *   npx tsx scripts/research/run-perp-signal-study.ts --no-lag      (diagnostic)
 *   npx tsx scripts/research/run-perp-signal-study.ts --rebuild
 *
 * This is the perp equivalent of `run-signal-study.ts`, which does the same job
 * for equities. Adding a signal to `src/lib/markets/perp-signals.ts` is the only
 * change needed for it to appear here.
 *
 * HOW TO READ THE OUTPUT
 * ----------------------
 * Four numbers per signal, and they answer different questions:
 *
 *   IC       ordering skill. Directional signals only.
 *   lift     did the top decile by this signal contain the names that moved?
 *            Magnitude signals are benchmarked against the volatility family,
 *            not against 1.0x — volatility predicts volatility, so a naive
 *            1.0x null "discovers" that every volume and range signal works.
 *   basket   mean excess of the top 10, GROSS OF FEES (a constant round-trip
 *            fee is removed exactly by demeaning, so only funding survives).
 *   abs      the same basket's absolute net return, next to buy-everything.
 *            This is the number that says whether it made money.
 *
 * Nothing here is evidence on its own. ~30 signals x 2 horizons is ~60 tests, so
 * roughly 3 will read "significant" at alpha=0.05 from noise alone; the
 * Bonferroni line is printed and the combination search applies a
 * procedure-level null that this script deliberately does not.
 */
import "dotenv/config";
import {
  loadOrBuildPanel,
  printPanelStats,
  coveredSignals,
  STUDY_CONFIG,
  type PanelConfig,
} from "@/lib/markets/perp-panel";
import {
  buildRankCache,
  commonMask,
  evaluateCombo,
  rankCorrMatrix,
  type ComboResult,
} from "@/lib/markets/perp-evaluate";
import { PERP_SIGNALS, SHALLOW_COVERAGE, SIGNAL_BY_NAME } from "@/lib/markets/perp-signals";

const argOf = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const HORIZONS = argOf("--horizon", "6,18").split(",").map(Number);
const NO_LAG = process.argv.includes("--no-lag");
const REBUILD = process.argv.includes("--rebuild");
const COVERAGE_FLOOR = Number(argOf("--coverage", "0.5"));

const f = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "—");

function run(horizon: number): void {
  const cfg: PanelConfig = { ...STUDY_CONFIG, horizon, entryLag: NO_LAG ? 0 : 1 };
  const panel = loadOrBuildPanel(cfg, PERP_SIGNALS, { rebuild: REBUILD });
  printPanelStats(panel);

  const covered = coveredSignals(panel, COVERAGE_FLOOR);
  const excluded = panel.signalNames.filter((n) => !covered.includes(n));

  const cache = buildRankCache(panel);

  // Volatility benchmark for the capture metric. Taken as the MAX over the
  // volatility family so a magnitude signal cannot clear the bar by being
  // compared against the weakest available proxy for "this name is volatile".
  const volFamily = ["atrPct", "volPctl120", "bbWidthPctl120", "rangeExpansion"].filter((n) =>
    covered.includes(n),
  );
  let volBenchmark = 1;
  for (const n of volFamily) {
    const r = evaluateCombo(panel, cache, [n], commonMask(panel, [n]));
    if (Number.isFinite(r.captureLift)) volBenchmark = Math.max(volBenchmark, r.captureLift);
  }

  const results: { name: string; group: string; pol: string; cov: number; r: ComboResult }[] = [];
  for (const name of covered) {
    const spec = SIGNAL_BY_NAME.get(name)!;
    const mask = commonMask(panel, [name]);
    const r = evaluateCombo(panel, cache, [name], mask);
    const s = panel.signalNames.indexOf(name);
    results.push({ name, group: spec.group, pol: spec.polarity, cov: panel.coverage[s], r });
  }

  const bonf = Math.abs(2.807);
  console.log(
    `\n${"=".repeat(104)}\nHORIZON ${horizon} bars (${((horizon * 4) / 24).toFixed(1)} days)` +
      `  ·  entry lag ${cfg.entryLag} bar${cfg.entryLag === 1 ? "" : "s"}` +
      `  ·  ${covered.length} signals over coverage floor ${COVERAGE_FLOOR}\n${"=".repeat(104)}`,
  );
  console.log(
    `Capture null for magnitude signals = ${f(volBenchmark, 2)}x ` +
      `(best of ${volFamily.join(", ") || "none"}), NOT 1.00x.`,
  );

  // The capture column shows lift MINUS its applicable null, not a t-statistic
  // computed against 1.0 — for a magnitude signal the reference is the
  // volatility benchmark, and printing a t against the wrong reference next to
  // a 3.4x null invites exactly the misreading the benchmark exists to prevent.
  console.log(
    `\n  ${"signal".padEnd(18)} ${"group".padEnd(11)} ${"cov".padStart(5)} ` +
      `${"IC".padStart(7)} ${"t".padStart(6)} ${"lift".padStart(6)} ${"vs null".padStart(8)} ` +
      `${"basket%".padStart(8)} ${"t".padStart(6)} ${"abs%".padStart(7)} ${"base%".padStart(7)}  verdict`,
  );
  console.log(`  ${"-".repeat(100)}`);

  results.sort((a, b) => Math.abs(b.r.ic.tStat || 0) - Math.abs(a.r.ic.tStat || 0));

  for (const { name, group, pol, cov, r } of results) {
    const isMag = pol === "magnitude";
    const liftVsNull = Number.isFinite(r.captureLift)
      ? r.captureLift - (isMag ? volBenchmark : 1)
      : NaN;
    const verdict =
      !isMag && Math.abs(r.ic.tStat) > bonf
        ? r.ic.tStat > 0
          ? "SURVIVES +"
          : "SURVIVES −"
        : isMag && liftVsNull > 0 && r.captureT > bonf
          ? "SURVIVES (capture)"
          : (!isMag && Math.abs(r.ic.tStat) > 1.96) || (isMag && liftVsNull > 0)
            ? "nominal only"
            : "";

    const vsNull = Number.isFinite(liftVsNull)
      ? `${liftVsNull >= 0 ? "+" : ""}${liftVsNull.toFixed(2)}`
      : "—";

    console.log(
      `  ${name.padEnd(18)} ${group.padEnd(11)} ${(100 * cov).toFixed(0).padStart(4)}% ` +
        `${(isMag ? "—" : f(r.ic.meanIc)).padStart(7)} ${(isMag ? "—" : f(r.ic.tStat, 2)).padStart(6)} ` +
        `${f(r.captureLift, 2).padStart(6)} ${vsNull.padStart(8)} ` +
        `${(isMag ? "—" : f(r.basketExcess, 3)).padStart(8)} ${(isMag ? "—" : f(r.basketExcessT, 2)).padStart(6)} ` +
        `${(isMag ? "—" : f(r.basketAbs, 3)).padStart(7)} ${(isMag ? "—" : f(r.baselineAbs, 3)).padStart(7)}  ${verdict}`,
    );
  }

  console.log(
    `\n  ${results.length} signals tested at this horizon; |t| > ${bonf} required to survive\n` +
      `  multiple testing. Magnitude signals carry no IC or basket by construction —\n` +
      `  they claim a move, not a direction.`,
  );

  if (excluded.length) {
    console.log(
      `\n  EXCLUDED for coverage below ${COVERAGE_FLOOR}: ${excluded.join(", ")}\n` +
        `  Every one of these is open-interest or taker derived. The venue serves only\n` +
        `  ~30 days of that data, which at this horizon is a handful of non-overlapping\n` +
        `  observations. That includes oiChangeAbs — the metric the live report ranks on.`,
    );
  }

  // ---- redundancy: which of these are the same bet wearing two names ----
  const top = results.slice(0, 12).map((x) => x.name);
  if (top.length > 2) {
    const mask = commonMask(panel, top);
    const corr = rankCorrMatrix(panel, top, mask);
    console.log("\n  Rank correlation among the 12 strongest (|r| > 0.7 flagged):");
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        if (Math.abs(corr[i][j]) > 0.7) {
          console.log(`    ${top[i].padEnd(18)} ${top[j].padEnd(18)} ${f(corr[i][j], 2).padStart(6)}`);
        }
      }
    }
  }
}

function main() {
  console.log("Perp single-signal study");
  console.log(
    "Excess return = net-of-funding forward return minus the category mean at that timestamp.\n" +
      "Convention: higher is better for every signal, so reversal signals are sign-flipped.",
  );
  if (NO_LAG) {
    console.log(
      "\n*** --no-lag: entry is the SAME close the signal was read from. This is a\n" +
        "*** diagnostic only. Any edge that disappears when the lag is restored was\n" +
        "*** spread capture, not alpha. Do not make a decision on these numbers.",
    );
  }
  for (const h of HORIZONS) run(h);
}

main();
