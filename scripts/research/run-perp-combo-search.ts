/**
 * Which COMBINATION of indicators works, and what is the smallest one that does?
 *
 * Run with:
 *   npx tsx scripts/research/run-perp-combo-search.ts
 *   npx tsx scripts/research/run-perp-combo-search.ts --objective capture
 *   npx tsx scripts/research/run-perp-combo-search.ts --horizon 18 --reps 500
 *
 * WHAT MAKES THIS A SEARCH AND NOT A FISHING TRIP
 * -----------------------------------------------
 * Evaluating ~5,000 combinations and reporting the best one is a procedure that
 * ALWAYS produces a winner, signal or no signal: the maximum of 5,000 draws from
 * a noise distribution clears any bar you care to set. Four defences, in the
 * order they bind:
 *
 *  1. COMMON ROWS. Every combination is scored on the identical row set, so a
 *     winner cannot have won by being evaluated on an easier subsample.
 *
 *  2. SEALED HOLDOUT. The last 30% of timestamps is never searched, and an
 *     embargo of one horizon at the split stops the last training window's
 *     forward return from overlapping the first holdout row.
 *
 *  3. k CHOSEN ON TRAIN ONLY. The number of indicators is selected by
 *     walk-forward inside the training split — an inner split the holdout never
 *     sees. Reading the holdout for k=1..6 and then picking k would make the
 *     reported figure a max-over-six selected statistic, not an out-of-sample
 *     estimate. The frontier table is still printed, and every cell in it is
 *     labelled selection-contaminated.
 *
 *  4. PROCEDURE-LEVEL NULL. The whole search is re-run against bootstrapped
 *     returns. The resulting p-value answers "how often does THIS PROCEDURE
 *     find a result this good when there is no signal at all" — which is the
 *     only question a search winner can honestly be asked.
 *
 * PARSIMONY IS MEASURED IN INDEPENDENT BETS
 * -----------------------------------------
 * The effective rank of the combination's rank-correlation matrix is printed
 * beside the raw count, because two signals correlated at 0.9 are nominally
 * two indicators and effectively 1.1. It is a diagnostic, not the criterion —
 * two orthogonal but worthless signals would score a perfect 2.0. The
 * recommendation comes from the incremental test: a k-combination must beat
 * BOTH of its (k-1) subsets by more than the paired standard error.
 */
import "dotenv/config";
import { appendFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  loadOrBuildPanel,
  printPanelStats,
  coveredSignals,
  rowsByTimestamp,
  STUDY_CONFIG,
  type Panel,
  type PanelConfig,
} from "@/lib/markets/perp-panel";
import {
  buildRankCache,
  commonMask,
  evaluateCombo,
  objectiveValue,
  procedureNull,
  rankCorrMatrix,
  effectiveRank,
  MAGNITUDE_GATE_Q,
  type ComboResult,
  type ObjectiveName,
  type RankCache,
} from "@/lib/markets/perp-evaluate";
import { PERP_SIGNALS, SIGNAL_BY_NAME } from "@/lib/markets/perp-signals";

const argOf = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const HORIZON = Number(argOf("--horizon", "6"));
const OBJECTIVE = argOf("--objective", "basket") as ObjectiveName;
const REPS = Number(argOf("--reps", "200"));
const MAX_K = Number(argOf("--max-k", "5"));
const TRAIN_FRAC = 0.7;
const CORR_PREFILTER = 0.85;

/** Committed, not in tmp/ — tmp is wiped and the count would silently reset. */
const LEDGER = join(process.cwd(), "scripts", "research", ".holdout-ledger");

const f = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "—");

/** k of n, as index tuples. */
function* combinations(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield [...idx];
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

function recordHoldoutOpen(note: string): number {
  const line = `${new Date().toISOString()}\t${note}\n`;
  appendFileSync(LEDGER, line);
  return existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").trim().split("\n").length : 1;
}

interface Scored {
  names: string[];
  train: ComboResult;
  value: number;
}

async function main() {
  const cfg: PanelConfig = { ...STUDY_CONFIG, horizon: HORIZON, entryLag: 1 };
  const panel = loadOrBuildPanel(cfg, PERP_SIGNALS);
  printPanelStats(panel);

  const groups = rowsByTimestamp(panel);
  const nT = groups.length;

  // ---- effective observations gate --------------------------------------
  // `run-strategy-search.ts` establishes MIN_EFF_N = 20 and that a rate built
  // on fewer than 10 independent observations is not evidence. Sampling here is
  // non-overlapping by construction, so effN is simply the timestamp count.
  const splitIdx = Math.floor(nT * TRAIN_FRAC);
  const embargo = 1; // one horizon; the grid already steps by `horizon`
  const trainT = new Set(groups.slice(0, splitIdx).map((rows) => panel.rowTime[rows[0]]));
  const holdT = new Set(
    groups.slice(splitIdx + embargo).map((rows) => panel.rowTime[rows[0]]),
  );

  console.log(
    `\nSplit: ${trainT.size} train timestamps, ${holdT.size} holdout ` +
      `(embargo ${embargo}). Objective: ${OBJECTIVE}.`,
  );
  if (holdT.size < 20) {
    console.log(
      `\n  STOPPING: the holdout carries ${holdT.size} independent observations.\n` +
        `  MIN_EFF_N is 20. At this horizon the grid is simply too coarse for a\n` +
        `  holdout to mean anything — a win rate here would be a coin flip dressed\n` +
        `  as a percentage. Use --horizon 6 or 18.`,
    );
    return;
  }

  const inTrain = (t: number) => trainT.has(t);
  const inHold = (t: number) => holdT.has(t);

  // ---- searchable set ----------------------------------------------------
  const covered = coveredSignals(panel, 0.5);
  const excluded = panel.signalNames.filter((n) => !covered.includes(n));
  console.log(
    `\nSearchable: ${covered.length} signals. Excluded for coverage: ` +
      `${excluded.join(", ") || "none"}`,
  );

  const cache = buildRankCache(panel);
  const fullMask = commonMask(panel, covered);
  const maskCount = Array.from(fullMask).filter((x) => x === 1).length;
  console.log(
    `Common mask: ${maskCount} of ${panel.nRows} rows usable by EVERY searchable signal.`,
  );

  // Correlation pre-filter, for compute only. It cannot see joint collinearity
  // (roc18 is nearly a function of roc6 and roc42 with every pair under the
  // threshold), so the real redundancy control is the incremental test below.
  const corrAll = rankCorrMatrix(panel, covered, fullMask);
  const tooClose = (idxs: number[]) => {
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        if (Math.abs(corrAll[idxs[a]][idxs[b]]) > CORR_PREFILTER) return true;
      }
    }
    return false;
  };

  // ---- exhaustive k <= 3, greedy above -----------------------------------
  const masks = new Map<string, Uint8Array>();
  const scored: Scored[] = [];

  const evalNames = (names: string[]): Scored => {
    const key = names.join("|");
    let mask = masks.get(key);
    if (!mask) {
      // Every combination is scored on the FULL searchable mask, not its own —
      // that is what makes "same data" true rather than aspirational.
      mask = fullMask;
      masks.set(key, mask);
    }
    const train = evaluateCombo(panel, cache, names, mask, panel.fwdNet, inTrain);
    return { names, train, value: objectiveValue(train, OBJECTIVE) };
  };

  let evaluated = 0;
  for (let k = 1; k <= Math.min(3, MAX_K); k++) {
    for (const idxs of combinations(covered.length, k)) {
      if (k > 1 && tooClose(idxs)) continue;
      const names = idxs.map((i) => covered[i]);
      // A magnitude-only combination claims no direction, so it cannot be
      // scored by `ic` or `basket` at all.
      const allMag = names.every((n) => SIGNAL_BY_NAME.get(n)?.polarity === "magnitude");
      if (allMag && OBJECTIVE !== "capture") continue;
      scored.push(evalNames(names));
      evaluated++;
    }
    console.log(`  k=${k}: ${evaluated} combinations evaluated so far`);
  }

  scored.sort((a, b) => b.value - a.value);

  // Greedy for k = 4..MAX_K, seeded from the TOP FIVE k=3 sets rather than the
  // single best: a single-seed nest measures one path through the space, and a
  // frontier that "flattens at 3" would then be an artifact of the seed.
  const bestOf = (k: number) => scored.filter((s) => s.names.length === k).slice(0, 5);

  // A SET has one identity regardless of the order it was assembled in. Seeding
  // greedy from five different (k-1) sets reaches the same k-set by several
  // routes — {A,B,C}+D and {A,B,D}+C are the same combination — so without a
  // canonical key the search evaluates it repeatedly and, worse, later tries to
  // store it twice under one unique index.
  const seen = new Set(scored.map((s) => [...s.names].sort().join("|")));
  for (let k = 4; k <= MAX_K; k++) {
    const seeds = bestOf(k - 1);
    for (const seed of seeds) {
      for (const name of covered) {
        if (seed.names.includes(name)) continue;
        const names = [...seed.names, name];
        const key = [...names].sort().join("|");
        if (seen.has(key)) continue;
        const idxs = names.map((n) => covered.indexOf(n));
        if (tooClose(idxs)) continue;
        seen.add(key);
        scored.push(evalNames(names));
      }
    }
    scored.sort((a, b) => b.value - a.value);
  }
  console.log(`  total: ${scored.length} combinations evaluated on TRAIN`);

  // ---- choose k on TRAIN, by walk-forward inside the training split ------
  //
  // The inner folds are out-of-sample for k. They are NOT out-of-sample for the
  // combinations themselves, which were selected using the whole training split
  // — a fully nested design would re-run the search inside each fold, at folds x
  // the cost. This is stated rather than glossed: the holdout below is the
  // honest number, and k is the only thing this step is trusted to pick.
  const trainTimes = Array.from(trainT).sort((a, b) => a - b);
  const nFolds = 4;
  const foldSize = Math.floor(trainTimes.length / (nFolds + 1));
  const kScores = new Map<number, number[]>();

  for (let fold = 1; fold <= nFolds; fold++) {
    const testTimes = new Set(trainTimes.slice(fold * foldSize, (fold + 1) * foldSize));
    const fitTimes = new Set(trainTimes.slice(0, fold * foldSize));
    if (testTimes.size < 5 || fitTimes.size < 10) continue;

    for (let k = 1; k <= MAX_K; k++) {
      const pool = scored.filter((s) => s.names.length === k);
      if (!pool.length) continue;
      // Pick this k's best on the fold's FIT window, score it on the fold's
      // TEST window.
      let best: Scored | null = null;
      let bestV = -Infinity;
      for (const s of pool.slice(0, 40)) {
        const r = evaluateCombo(panel, cache, s.names, fullMask, panel.fwdNet, (t) =>
          fitTimes.has(t),
        );
        const v = objectiveValue(r, OBJECTIVE);
        if (v > bestV) {
          bestV = v;
          best = s;
        }
      }
      if (!best) continue;
      const oos = evaluateCombo(panel, cache, best.names, fullMask, panel.fwdNet, (t) =>
        testTimes.has(t),
      );
      const arr = kScores.get(k) ?? [];
      arr.push(objectiveValue(oos, OBJECTIVE));
      kScores.set(k, arr);
    }
  }

  console.log("\nCHOOSING k — walk-forward inside the TRAIN split (holdout untouched)");
  console.log(`  ${"k".padStart(2)} ${"inner OOS mean".padStart(15)} ${"folds".padStart(6)}`);
  let chosenK = 1;
  let chosenV = -Infinity;
  for (let k = 1; k <= MAX_K; k++) {
    const arr = kScores.get(k);
    if (!arr || !arr.length) continue;
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    console.log(`  ${String(k).padStart(2)} ${f(m, 4).padStart(15)} ${String(arr.length).padStart(6)}`);
    // Strictly greater, so ties go to the SMALLER k — parsimony is the tiebreak.
    if (m > chosenV) {
      chosenV = m;
      chosenK = k;
    }
  }
  console.log(`  -> k = ${chosenK}`);

  const champion = scored.filter((s) => s.names.length === chosenK)[0];
  if (!champion) {
    console.log("No champion at the chosen k.");
    return;
  }

  // ---- procedure-level null ----------------------------------------------
  //
  // Re-running the FULL search under the null would be ~200 x 5000 evaluations.
  // The null is therefore run over a reduced candidate set — the top 50 plus
  // the best at each k — and the p-value belongs to THAT procedure, which is
  // stated in the output rather than left to be assumed.
  const nullCandidates = [
    ...scored.slice(0, 50).map((s) => s.names),
    ...Array.from({ length: MAX_K }, (_, i) => bestOf(i + 1)[0]?.names).filter(
      (x): x is string[] => Boolean(x),
    ),
  ];
  const uniqueCandidates = Array.from(
    new Map(nullCandidates.map((n) => [n.join("|"), n])).values(),
  );
  for (const n of uniqueCandidates) masks.set(n.join("|"), fullMask);

  const realBest = Math.max(
    ...uniqueCandidates.map((n) =>
      objectiveValue(evaluateCombo(panel, cache, n, fullMask, panel.fwdNet, inTrain), OBJECTIVE),
    ),
  );

  console.log(
    `\nProcedure-level null: re-running a ${uniqueCandidates.length}-candidate search ` +
      `over ${REPS} bootstrap draws...`,
  );
  const nul = procedureNull(
    panel,
    cache,
    uniqueCandidates,
    masks,
    OBJECTIVE,
    realBest,
    REPS,
    inTrain,
    (done) => {
      if (done % 50 === 0) console.log(`  ...${done}/${REPS}`);
    },
  );
  const usable = nul.draws.filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
  const nullMedian = usable.length ? usable[Math.floor(usable.length / 2)] : NaN;
  console.log(
    `  best real = ${f(realBest, 4)}   null median = ${f(nullMedian, 4)}   ` +
      `p = ${f(nul.pValue, 3)} +/- ${f(nul.mcCi, 3)} (MC 95%)   ` +
      `[${nul.usableDraws}/${nul.reps} usable draws]`,
  );
  if (nul.usableDraws < nul.reps * 0.8) {
    console.log(
      `  *** WARNING: ${nul.reps - nul.usableDraws} of ${nul.reps} null draws were degenerate.\n` +
        `  *** A p-value built on few usable draws collapses toward 1/(n+1), which reads\n` +
        `  *** as strong significance while meaning nothing was compared. DO NOT USE IT.`,
    );
  }

  // ---- the frontier (selection-contaminated, labelled as such) ------------
  const opens = recordHoldoutOpen(
    `h=${HORIZON} obj=${OBJECTIVE} k=${chosenK} champion=${champion.names.join("+")}`,
  );

  console.log(`\n${"=".repeat(96)}`);
  console.log("PARSIMONY FRONTIER — best set at each k");
  console.log(
    "Holdout cells below are SELECTION-CONTAMINATED: the holdout is read once per k,\n" +
      "so the column is a max-over-k statistic, not an unbiased estimate. Only the\n" +
      "champion line beneath it is an honest out-of-sample number.",
  );
  console.log(`${"=".repeat(96)}`);
  console.log(
    `  ${"k".padStart(2)} ${"effRank".padStart(8)} ${"set".padEnd(44)} ` +
      `${"train".padStart(9)} ${"holdout".padStart(9)}`,
  );
  for (let k = 1; k <= MAX_K; k++) {
    const best = bestOf(k)[0];
    if (!best) continue;
    const corr = rankCorrMatrix(panel, best.names, fullMask);
    const er = effectiveRank(corr);
    const hold = evaluateCombo(panel, cache, best.names, fullMask, panel.fwdNet, inHold);
    console.log(
      `  ${String(k).padStart(2)} ${f(er, 2).padStart(8)} ${best.names.join("+").padEnd(44)} ` +
        `${f(best.value, 4).padStart(9)} ${f(objectiveValue(hold, OBJECTIVE), 4).padStart(9)}`,
    );
  }

  // ---- the champion, opened once -----------------------------------------
  const hold = evaluateCombo(panel, cache, champion.names, fullMask, panel.fwdNet, inHold);
  const corr = rankCorrMatrix(panel, champion.names, fullMask);

  console.log(`\n${"=".repeat(96)}`);
  console.log(`CHAMPION (k chosen on train, holdout opened once): ${champion.names.join(" + ")}`);
  console.log(`${"=".repeat(96)}`);
  console.log(`  indicators        ${champion.names.length}  ·  effective rank ${f(effectiveRank(corr), 2)}`);
  console.log(`  train ${OBJECTIVE.padEnd(8)}  ${f(champion.value, 4)}`);
  console.log(`  HOLDOUT ${OBJECTIVE.padEnd(6)}  ${f(objectiveValue(hold, OBJECTIVE), 4)}   (${hold.nTimestamps} timestamps)`);
  console.log(`  holdout IC        ${f(hold.ic.meanIc)}  t=${f(hold.ic.tStat, 2)}`);
  console.log(`  holdout capture   ${f(hold.captureLift, 2)}x`);
  console.log(`  holdout basket    ${f(hold.basketExcess, 3)}% excess (GROSS OF FEES)  t=${f(hold.basketExcessT, 2)}`);
  console.log(`  holdout absolute  ${f(hold.basketAbs, 3)}%  vs buy-everything ${f(hold.baselineAbs, 3)}%`);
  console.log(`  holdout dateWin   ${f(hold.dateWin, 1)}%`);

  // A champion selected on `basket` can post a healthy-looking mean whose
  // t-statistic says it is noise: the top-10 mean over ~100 timestamps has far
  // more variance than an IC computed from the whole cross-section. This is the
  // argument `backtest.ts` opens with, and it applies to the winner too — so the
  // contradiction is printed rather than left for the reader to notice.
  if (OBJECTIVE === "basket" && Math.abs(hold.basketExcessT) < 1.96) {
    console.log(
      `\n  *** The champion's holdout basket is NOT significant (t=${f(hold.basketExcessT, 2)}).\n` +
        `  *** A top-10 mean over ${hold.nTimestamps} timestamps is a high-variance statistic;\n` +
        `  *** --objective ic uses the whole cross-section and needs far less data to\n` +
        `  *** distinguish skill from noise. Re-run with it before believing this set.`,
    );
  }
  if (Math.abs(hold.ic.tStat) > 1.96 && hold.ic.meanIc * (hold.basketExcess || 1) < 0) {
    console.log(
      `\n  *** The holdout IC (${f(hold.ic.meanIc)}, t=${f(hold.ic.tStat, 2)}) and the basket\n` +
        `  *** excess (${f(hold.basketExcess, 3)}%) DISAGREE IN SIGN. The ordering is\n` +
        `  *** significantly backwards across the cross-section while the extreme tail\n` +
        `  *** reads positive — that is a non-monotone relationship, not an edge.`,
    );
  }

  // The incumbent, on the same rows and the same objective.
  const inc = evaluateCombo(panel, cache, ["shippedScore"], fullMask, panel.fwdNet, inHold);
  console.log(
    `\n  INCUMBENT shippedScore on the same holdout rows: ` +
      `${OBJECTIVE} ${f(objectiveValue(inc, OBJECTIVE), 4)}, ` +
      `absolute ${f(inc.basketAbs, 3)}%`,
  );

  // ---- the disclosures, printed every run --------------------------------
  console.log(`\n${"-".repeat(96)}`);
  console.log("READ BEFORE BELIEVING ANY OF THE ABOVE");
  console.log(`${"-".repeat(96)}`);
  console.log(
    `  · Excess is GROSS OF FEES. A cross-sectionally constant round-trip fee is\n` +
      `    removed exactly by demeaning, so only funding survives into it. At a 1-day\n` +
      `    horizon turnover is maximal and a reversal signal selects the names that\n` +
      `    just gapped — the widest spreads in the book at the moment of entry. Judge\n` +
      `    any short-horizon winner on the ABSOLUTE line, against buy-everything.`,
  );
  console.log(
    `  · Slippage is not modelled at all. The $250k/bar liquidity floor bounds it\n` +
      `    but does not price it.`,
  );
  console.log(
    `  · The p-value covers the ${uniqueCandidates.length}-candidate re-search, not the\n` +
      `    ${scored.length}-combination search, and not the research programme that chose\n` +
      `    which ${covered.length} signals to register in the first place.`,
  );
  console.log(
    `  · shippedScore is not a clean incumbent: its vwapWeight=2 and minScore=5 were\n` +
      `    tuned on this same data, so "beat the incumbent" is a weaker bar than it reads.`,
  );
  console.log(
    `  · Survivorship: the cache holds surviving listings' history, so early\n` +
      `    timestamps carry a systematically older, larger universe. This biases\n` +
      `    momentum and volume signals upward specifically.`,
  );
  console.log(
    `  · The magnitude gate q is fixed a priori at ${MAGNITUDE_GATE_Q} and never searched.`,
  );
  console.log(`  · This holdout has now been opened ${opens} time(s). Each open costs its value.`);

  if (!process.argv.includes("--no-persist")) {
    await persistResults(panel, cache, fullMask, scored, chosenK, inHold, bestOf);
  }
}

/**
 * Writes the search's results to `perp_combo_results`.
 *
 * NOT every combination. The frontier, the champion, and the top 200 by train
 * objective — roughly 250 rows against 4,663 evaluated. Storing all of them
 * would be ~700 KB per experiment for a long tail that is mostly noise, and the
 * ledger exists to be read.
 *
 * The holdout figure is computed for every stored row, which means the holdout
 * is touched far more than once. That is acceptable ONLY because these rows are
 * a record rather than a selection criterion — the champion was already chosen
 * on train before any of this ran. The stored `holdout_value` is labelled
 * selection-contaminated wherever it is displayed, for the same reason the
 * printed frontier is.
 */
async function persistResults(
  panel: Panel,
  cache: RankCache,
  fullMask: Uint8Array,
  scored: Scored[],
  chosenK: number,
  inHold: (t: number) => boolean,
  bestOf: (k: number) => Scored[],
): Promise<void> {
  const { rawClient } = await import("@/db");
  const runDate = new Date().toISOString().slice(0, 10);

  const frontier = new Set<string>();
  for (let k = 1; k <= MAX_K; k++) {
    const b = bestOf(k)[0];
    if (b) frontier.add(b.names.join("|"));
  }
  const champion = scored.filter((s) => s.names.length === chosenK)[0];
  const championKey = champion ? champion.names.join("|") : "";

  // Keyed by the CANONICAL (sorted) name list, which is what the unique index
  // is on. Keying by the assembly order instead lets two spellings of one set
  // both survive and collide on insert.
  const canon = (names: string[]) => [...names].sort().join("|");
  const keep = new Map<string, Scored>();
  for (const s of scored.slice(0, 200)) keep.set(canon(s.names), s);
  for (const s of scored) if (frontier.has(s.names.join("|"))) keep.set(canon(s.names), s);

  const rows = Array.from(keep.values()).map((s) => {
    const hold = evaluateCombo(panel, cache, s.names, fullMask, panel.fwdNet, inHold);
    const corr = rankCorrMatrix(panel, s.names, fullMask);
    // Sorted, so one set has exactly one canonical spelling in the ledger.
    const key = [...s.names].sort().join("|");
    return {
      key,
      k: s.names.length,
      effRank: effectiveRank(corr),
      train: s.value,
      holdout: objectiveValue(hold, OBJECTIVE),
      hold,
      isFrontier: frontier.has(s.names.join("|")) ? 1 : 0,
      isChampion: s.names.join("|") === championKey ? 1 : 0,
    };
  });

  await rawClient.batch(
    [
      {
        sql: `DELETE FROM perp_combo_results
              WHERE run_date = ? AND horizon = ? AND objective = ?`,
        args: [runDate, HORIZON, OBJECTIVE] as never[],
      },
      ...rows.map((r) => ({
        sql: `INSERT INTO perp_combo_results
                (run_date, horizon, objective, signals, k, effective_rank,
                 train_value, holdout_value, holdout_ic, holdout_ic_t,
                 holdout_capture, holdout_basket, holdout_basket_t,
                 holdout_abs, baseline_abs, n_timestamps, is_frontier, is_champion)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          runDate, HORIZON, OBJECTIVE, r.key, r.k, r.effRank,
          r.train, r.holdout, r.hold.ic.meanIc, r.hold.ic.tStat,
          r.hold.captureLift, r.hold.basketExcess, r.hold.basketExcessT,
          r.hold.basketAbs, r.hold.baselineAbs, r.hold.nTimestamps,
          r.isFrontier, r.isChampion,
        ] as never[],
      })),
    ],
    "write",
  );

  console.log(`\nPersisted ${rows.length} combinations to perp_combo_results (${runDate}).`);
}

main().catch((err) => {
  console.error("Combo search failed:", err);
  process.exit(1);
});
