/**
 * Measures whether the champion-challenger promotion test is achievable.
 *
 * The adversarial review argued the promotion design is unpassable, resting on
 * one back-solved assumption: that the paired statistic d_t = IC_challenger(t)
 * - IC_champion(t) needs a per-date IC correlation of rho ~ 0.89 to reach the
 * stated timelines, and that reversal-vs-trend cannot possibly correlate that
 * highly. That is a claim about data, not about design — so measure it rather
 * than argue it.
 *
 * Run with:
 *   npx tsx scripts/research/run-pairing-check.ts
 *   npx tsx scripts/research/run-pairing-check.ts --horizon 5
 *
 * Reports, for every candidate pairing: the realised correlation of the two
 * per-date IC series, the standard deviation of the paired difference, the
 * t-statistic that difference achieves over the available history, and the
 * number of non-overlapping dates required to clear a Bonferroni floor.
 */
import * as fs from "fs";
import * as path from "path";
import { replay, spearman, type Bar, type DateSlice, type ScoredRow } from "@/lib/markets/backtest";
import { rankZ } from "@/lib/markets/signals";

const CACHE_DIR = path.join(process.cwd(), ".cache", "price-history");
const argOf = (f: string, d: string) => {
  const i = process.argv.indexOf(f);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const HORIZON = Number(argOf("--horizon", "5"));
const BONF = 2.807; // the floor used throughout this repo's research

function loadHistory(): Map<string, Bar[]> {
  const out = new Map<string, Bar[]>();
  for (const f of fs.readdirSync(CACHE_DIR).filter((x) => x.endsWith(".json"))) {
    const bars = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), "utf8")) as Bar[];
    if (bars.length >= 300) out.set(f.replace(/\.json$/, ""), bars);
  }
  return out;
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const std = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};
const pearson = (x: number[], y: number[]) => {
  const mx = mean(x), my = mean(y);
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) {
    n += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return n / Math.sqrt(dx * dy);
};

/** Per-date IC series for a row-level score, dropping unscoreable rows. */
function icSeries(slices: DateSlice[], get: (r: ScoredRow) => number | null): number[] {
  return slices.map((s) => {
    const xs: number[] = [], ys: number[] = [];
    for (const r of s.rows) {
      const v = get(r);
      if (v === null || !Number.isFinite(v)) continue;
      xs.push(v);
      ys.push(r.excess);
    }
    return spearman(xs, ys);
  });
}

function main() {
  const history = loadHistory();
  const slices = replay(history, { horizon: HORIZON });
  console.log(`Horizon ${HORIZON}d · ${slices.length} non-overlapping dates · ${history.size} tickers\n`);

  // The frozen menu the design proposes.
  const CONFIGS: { id: string; get: (r: ScoredRow) => number | null }[] = [
    { id: "C0 technical_score", get: (r) => r.technical },
    { id: "C1 rev1wVolAdj", get: (r) => r.signals.rev1wVolAdj ?? null },
    { id: "C2 mom12+rev1w", get: (r) => null }, // filled below (needs per-date ranks)
    { id: "C3 momentum_score", get: (r) => r.momentum },
  ];

  const series = new Map<string, number[]>();
  for (const c of CONFIGS) {
    if (c.id.startsWith("C2")) continue;
    series.set(c.id, icSeries(slices, c.get));
  }
  // C2 is a rank blend, so it must be built per date across the cross-section.
  series.set(
    "C2 mom12+rev1w",
    slices.map((s) => {
      const a = rankZ(s.rows.map((r) => r.signals.ret12mEx1m ?? null));
      const b = rankZ(s.rows.map((r) => r.signals.rev1wVolAdj ?? null));
      const xs: number[] = [], ys: number[] = [];
      s.rows.forEach((r, i) => {
        if (a[i] === null || b[i] === null) return;
        xs.push((a[i] as number) + (b[i] as number));
        ys.push(r.excess);
      });
      return spearman(xs, ys);
    }),
  );

  const ids = [...series.keys()];
  // Keep only dates where every config produced a finite IC, so all pairings
  // are computed on identical dates.
  const keep: number[] = [];
  for (let i = 0; i < slices.length; i++) {
    if (ids.every((id) => Number.isFinite(series.get(id)![i]))) keep.push(i);
  }
  const clean = new Map(ids.map((id) => [id, keep.map((i) => series.get(id)![i])]));
  const n = keep.length;

  console.log(`${n} dates where every config scores.\n`);
  console.log("PER-CONFIG");
  console.log(`  ${"config".padEnd(20)} ${"meanIC".padStart(8)} ${"sdIC".padStart(7)} ${"t".padStart(6)}`);
  for (const id of ids) {
    const v = clean.get(id)!;
    const m = mean(v), s = std(v);
    console.log(`  ${id.padEnd(20)} ${m.toFixed(4).padStart(8)} ${s.toFixed(4).padStart(7)} ${((m / s) * Math.sqrt(n)).toFixed(2).padStart(6)}`);
  }

  console.log("\nPAIRED CHALLENGER-vs-CHAMPION (d = challenger - champion)");
  console.log(
    `  ${"pairing".padEnd(34)} ${"rho".padStart(6)} ${"meanD".padStart(8)} ${"sdD".padStart(7)} ` +
      `${"t@n".padStart(7)} ${"n@2.807".padStart(8)}`,
  );
  for (const champ of ids) {
    for (const chal of ids) {
      if (champ === chal) continue;
      const a = clean.get(chal)!, b = clean.get(champ)!;
      const d = a.map((v, i) => v - b[i]);
      const rho = pearson(a, b);
      const md = mean(d), sd = std(d);
      const t = (md / sd) * Math.sqrt(n);
      // Dates needed for this observed effect to clear the Bonferroni floor.
      const need = md > 0 ? Math.ceil((BONF * sd / md) ** 2) : NaN;
      console.log(
        `  ${(chal + " vs " + champ).padEnd(34)} ${rho.toFixed(3).padStart(6)} ${md.toFixed(4).padStart(8)} ` +
          `${sd.toFixed(4).padStart(7)} ${t.toFixed(2).padStart(7)} ${(Number.isFinite(need) ? String(need) : "never").padStart(8)}`,
      );
    }
  }

  // The specific claim under test.
  const c1 = clean.get("C1 rev1wVolAdj")!, c0 = clean.get("C0 technical_score")!;
  const rho = pearson(c1, c0);
  const d = c1.map((v, i) => v - c0[i]);
  const t = (mean(d) / std(d)) * Math.sqrt(n);
  console.log(`\nCLAIM UNDER TEST: "rho must be ~0.89; reversal-vs-trend cannot reach it"`);
  console.log(`  measured rho(C1, C0) = ${rho.toFixed(3)}`);
  console.log(`  paired t over ${n} dates = ${t.toFixed(2)}  (Bonferroni floor ${BONF})`);
  console.log(`  → C1 over C0 ${t >= BONF ? "CLEARS the floor on existing history" : "does NOT clear the floor"}`);

  // ------------------------------------------------------------------
  // The blend scores highest standalone, but ret12mEx1m — one of its two
  // components — collapsed by ~3x under a liquidity filter in the earlier
  // signal study, which is what exposed the momentum family as an illiquidity
  // artifact. A blend can inherit that. Re-run the same two robustness cuts
  // before treating C2 as promotable.
  // ------------------------------------------------------------------
  const isUS = (t2: string) => !t2.includes(".");
  const subset = (filter: (r: ScoredRow, s: DateSlice) => boolean): DateSlice[] =>
    slices
      .map((s) => {
        const rows = s.rows.filter((r) => filter(r, s));
        if (rows.length < 30) return null;
        // Re-centre excess inside the subsample, else the benchmark is still
        // the full universe and the IC measures composition, not skill.
        const m = rows.reduce((a, b) => a + b.fwd, 0) / rows.length;
        return { ...s, rows: rows.map((r) => ({ ...r, excess: r.fwd - m })) };
      })
      .filter((s): s is DateSlice => s !== null);

  const blendIc = (sl: DateSlice[]) =>
    sl.map((s) => {
      const a = rankZ(s.rows.map((r) => r.signals.ret12mEx1m ?? null));
      const b = rankZ(s.rows.map((r) => r.signals.rev1wVolAdj ?? null));
      const xs: number[] = [], ys: number[] = [];
      s.rows.forEach((r, i) => {
        if (a[i] === null || b[i] === null) return;
        xs.push((a[i] as number) + (b[i] as number));
        ys.push(r.excess);
      });
      return spearman(xs, ys);
    });

  const usLiquid = subset((r, s) => {
    if (!isUS(r.ticker) || r.advLocal === null) return false;
    const advs = s.rows
      .filter((x) => isUS(x.ticker) && x.advLocal !== null)
      .map((x) => x.advLocal as number)
      .sort((a, b) => a - b);
    return advs.length > 0 && r.advLocal >= advs[Math.floor(advs.length / 2)];
  });
  const half = Math.floor(slices.length / 2);

  const row = (label: string, sl: DateSlice[]) => {
    const v = blendIc(sl).filter(Number.isFinite);
    if (v.length < 10) return `  ${label.padEnd(22)} n/a`;
    const m = mean(v), s = std(v);
    return `  ${label.padEnd(22)} IC ${m.toFixed(4).padStart(8)}  t ${((m / s) * Math.sqrt(v.length)).toFixed(2).padStart(6)}  (${v.length} dates)`;
  };

  console.log("\nC2 BLEND ROBUSTNESS (the cuts that exposed momentum as illiquidity)");
  console.log(row("all names", slices));
  console.log(row("US only", subset((r) => isUS(r.ticker))));
  console.log(row("US liquid half", usLiquid));
  console.log(row("first half of dates", slices.slice(0, half)));
  console.log(row("second half of dates", slices.slice(half)));
  process.exit(0);
}

main();
