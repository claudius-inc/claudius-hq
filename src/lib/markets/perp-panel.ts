/**
 * The panel: every signal, for every symbol, at every sampled timestamp, built
 * once and reused by every study.
 *
 * WHY A PANEL AT ALL
 * ------------------
 * The requirement is to compare many COMBINATIONS of indicators on identical
 * data. Recomputing signals per combination would be both ruinously slow and
 * quietly dishonest — two combinations evaluated on slightly different row sets
 * are not comparable, and nothing in the output would reveal it. So the signals
 * are computed exactly once into a dense matrix, and a combination is then just
 * a subset of columns. Same rows, same returns, same demeaning, always.
 *
 * SAMPLING — THE PART THAT IS EASY TO GET CATASTROPHICALLY WRONG
 * -------------------------------------------------------------
 * Timestamps come from a GLOBAL grid built from the union of every symbol's bar
 * times, stepped by `horizon`. Stepping each symbol's own array by index instead
 * is subtly and severely wrong: symbols have different history lengths, so
 * `bars[300]` is a different moment for each, and they land on disjoint
 * timestamp lattices that never share a cross-section. This reproduces the
 * reasoning already established in `run-perp-convergence-backtest.ts`.
 *
 * EXECUTION LAG — NEW, AND THE LARGEST CORRECTNESS FIX HERE
 * --------------------------------------------------------
 * The prior backtest reads the signal from bar `i` and enters at `bars[i].c` —
 * the SAME close the signal was computed from. At a one-day horizon a reversal
 * signal is the difference between two closes, and the forward window partly
 * reverses the very tick that created the signal. That is the most reliable way
 * to manufacture a large, significant, untradeable information coefficient, and
 * short-horizon reversal is exactly what this study expects to find.
 *
 * With `entryLag: 1` the signal is read at bar `i`, entry is the close of bar
 * `i+1`, and exit is the close of `i+1+horizon`. A signal that loses most of its
 * edge to one bar of lag was capturing spread, not alpha. Both settings are
 * available; only the lagged number may justify a decision.
 *
 * FUNDING IS CHARGED AS REALIZED, NOT AS A FULL-SAMPLE MEAN
 * --------------------------------------------------------
 * The prior backtest charges each name its mean funding rate over the WHOLE
 * sample at every historical timestamp, so a contract whose funding blew out in
 * month ten is charged that rate in month one. Funding level correlates with
 * precisely the crowded, trending names a momentum signal selects, so this is
 * not noise — it leaks information about the future into the cost model. With
 * `fundingMode: "realized"` the cost is the funding actually settled inside
 * `[entry, exit]`, summed from the per-symbol series.
 *
 * It also fixes a second error. `BARS_PER_FUNDING = 2` assumes every contract
 * settles every 8 hours. Measured across the live universe: 412 symbols settle
 * every 4h, 264 every 8h, 4 every 1h. The constant undercharges funding by 2x
 * for the majority of the book.
 *
 * ROWS ARE NEVER DELETED FOR CROSS-SECTIONAL REASONS
 * --------------------------------------------------
 * A row that fails the min-per-category or min-per-timestamp rule keeps its
 * place and gets `excess = NaN`. Deleting it would make the row count depend on
 * grouping logic that the counting pass cannot cheaply replicate, and any
 * divergence between the two passes would leave trailing ZEROS in the matrix
 * that are indistinguishable from real readings.
 */
import type { PerpBar, PerpSymbol, PerpCategory } from "@/lib/markets/perp-venues";
import {
  PERP_SIGNALS,
  SIGNAL_BY_NAME,
  registryHash,
  type PerpSignalSpec,
  type PerSymbolSpec,
  type SignalContext,
} from "@/lib/markets/perp-signals";
import {
  fundingCostOver,
  type PositioningHistory,
} from "@/lib/markets/perp-positioning-history";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/** Binance USDⓈ-M taker fee per side, VIP 0. */
export const TAKER_FEE_PCT = 0.05;
export const ROUND_TRIP_FEE_PCT = TAKER_FEE_PCT * 2;

export interface PanelConfig {
  /** Forward window, in bars. */
  horizon: number;
  /**
   * Bars between the signal and the entry. 0 reproduces the prior backtest;
   * 1 is the only honest setting for a decision. See the module docstring.
   */
  entryLag: number;
  /** `realized` sums actual settlements in the window; `meanRate` is legacy. */
  fundingMode: "realized" | "meanRate";
  /** Minimum names in a category before it can define its own mean. */
  minPerCategory: number;
  /** Minimum surviving rows before a timestamp is used at all. */
  minRows: number;
  /** Minimum 30-bar average traded value, in quote currency. 0 disables. */
  liquidityFloor: number;
  /** Bars used for the liquidity average. */
  liquidityBars: number;
  /** Offset into the grid, for phase-robustness runs. */
  gridPhase: number;
  /**
   * Categories the panel is built from. `null` means all of them.
   *
   * This exists because the default panel is 99.6% crypto and no amount of
   * reading it can say anything about the tradfi book. The cause is the WARMUP:
   * it is the max `minBars` over every registered signal, which `volPctl252`
   * sets at 552, and no equity or premarket perp has that much 4h history. So a
   * tradfi answer needs BOTH a shallower signal subset and this filter — the
   * subset alone would still let 147,727 crypto rows drown 634 equity ones in a
   * pooled information coefficient.
   */
  categories: PerpCategory[] | null;
}

/**
 * Legacy defaults reproduce the prior backtest's semantics exactly, so the
 * extracted core can be shared without changing any published number. The new
 * pipeline overrides all of them.
 */
export const LEGACY_CONFIG: PanelConfig = {
  horizon: 6,
  entryLag: 0,
  fundingMode: "meanRate",
  minPerCategory: 5,
  minRows: 30,
  liquidityFloor: 0,
  liquidityBars: 30,
  gridPhase: 0,
  categories: null,
};

export const STUDY_CONFIG: PanelConfig = {
  horizon: 6,
  entryLag: 1,
  fundingMode: "realized",
  minPerCategory: 15,
  minRows: 30,
  liquidityFloor: 250_000,
  liquidityBars: 30,
  gridPhase: 0,
  categories: null,
};

/**
 * The tradfi book on its own, at a warmup every equity perp can actually reach.
 *
 * `minPerCategory` drops to 8 because that is what the book HAS — commodity has
 * ~8 liquid names and premarket ~2, so the study default of 15 would null the
 * excess column for every category except equity and leave nothing to compare.
 * It is a necessity of the universe, not a tuning choice, and it is the reason
 * this config is named rather than passed inline at a call site.
 */
export const TRADFI_CONFIG: PanelConfig = {
  ...STUDY_CONFIG,
  minPerCategory: 8,
  categories: ["equity", "premarket", "commodity", "index"],
};

export interface Panel {
  config: PanelConfig;
  signalNames: string[];
  /** Sampled grid timestamps (bar OPEN times), ascending. */
  times: number[];
  symbols: string[];
  categories: string[];
  nRows: number;
  /** Row -> index into `times` / `symbols` / `categories`. */
  rowTime: Int32Array;
  rowSymbol: Int32Array;
  rowCategory: Uint8Array;
  /** Column-major: values[s * nRows + r]. NaN means undefined for that row. */
  values: Float64Array;
  /** Gross forward return, %, from entry close to exit close. */
  fwdGross: Float64Array;
  /** Gross minus round-trip fee minus realized funding, %. Long convention. */
  fwdNet: Float64Array;
  /** fwdNet minus the (timestamp, category) mean. NaN where undefined. */
  excess: Float64Array;
  /** Per-signal share of rows with a finite value, 0..1. */
  coverage: number[];
  /** Diagnostics, printed before any result. */
  stats: {
    universe: number;
    tooShort: number;
    illiquid: number;
    timestampsSampled: number;
    timestampsUsable: number;
    rowsByCategory: Record<string, number>;
    rowsWithExcess: number;
  };
}

export interface BarPayload {
  fetchedAt: string;
  symbols: PerpSymbol[];
  bars: Record<string, PerpBar[]>;
}

/**
 * Whether row `i` of `bars` can produce an observation.
 *
 * ONE predicate, used verbatim by both the counting pass and the fill pass. If
 * the two passes could disagree the matrix would end up with trailing zeros
 * that read as real signal values, so this must not be inlined or duplicated.
 *
 * Cross-sectional rules (min per category, min rows per timestamp) are
 * deliberately NOT here — they are applied by nulling `excess`, not by removing
 * rows, precisely so this predicate stays local to one symbol.
 */
export function isEligible(
  bars: PerpBar[],
  i: number,
  cfg: PanelConfig,
  warmup: number,
): boolean {
  if (i < warmup) return false;
  const entry = i + cfg.entryLag;
  const exit = entry + cfg.horizon;
  if (exit >= bars.length) return false;
  if (cfg.liquidityFloor > 0) {
    const from = Math.max(0, i - cfg.liquidityBars + 1);
    let sum = 0;
    let n = 0;
    for (let j = from; j <= i; j++) {
      if (Number.isFinite(bars[j].q)) {
        sum += bars[j].q;
        n++;
      }
    }
    if (n === 0 || sum / n < cfg.liquidityFloor) return false;
  }
  return true;
}

/** Union of all bar open-times, ascending, stepped by horizon from `gridPhase`. */
export function buildGrid(
  barsBySymbol: Record<string, PerpBar[]>,
  cfg: PanelConfig,
): number[] {
  const all = new Set<number>();
  for (const bars of Object.values(barsBySymbol)) {
    for (const b of bars) all.add(b.t);
  }
  const sorted = Array.from(all).sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = cfg.gridPhase; i < sorted.length; i += cfg.horizon) out.push(sorted[i]);
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/**
 * Builds the panel.
 *
 * Two passes. The first counts eligible rows using `isEligible` alone — no
 * signal computation, so it costs almost nothing — which is what makes the
 * column-major allocation possible. The second computes each symbol's signal
 * series, writes its rows, and DISCARDS the series before moving on. Holding
 * every series for every symbol at once would be ~1.3 GB of boxed nullable
 * numbers; streaming keeps the resident set to the matrix itself.
 */
export function buildPanel(
  payload: BarPayload,
  positioning: Map<string, PositioningHistory>,
  meanFunding: Record<string, number>,
  cfg: PanelConfig,
  signals: PerpSignalSpec[] = PERP_SIGNALS,
): Panel {
  const symbolMeta = new Map(payload.symbols.map((s) => [s.symbol, s]));
  const perSymbolSpecs = signals.filter((s): s is PerSymbolSpec => s.kind === "perSymbol");
  const crossSpecs = signals.filter((s) => s.kind === "crossSectional");
  const signalNames = [...perSymbolSpecs.map((s) => s.name), ...crossSpecs.map((s) => s.name)];

  const warmup = Math.max(
    ...perSymbolSpecs.map((s) => s.minBars),
    1,
  );

  const grid = buildGrid(payload.bars, cfg);
  const gridSet = new Map<number, number>();
  grid.forEach((t, i) => gridSet.set(t, i));

  // ---- pass 1: count ----
  const eligible = new Map<string, number[]>(); // symbol -> bar indices
  let tooShort = 0;
  let illiquid = 0;
  let nRows = 0;

  const allowed = cfg.categories === null ? null : new Set<string>(cfg.categories);

  for (const [symbol, bars] of Object.entries(payload.bars)) {
    const meta = symbolMeta.get(symbol);
    if (!meta) continue;
    // Filtered at BUILD time, not by masking rows afterwards. `excess` is
    // already demeaned per (timestamp, category), so that part would survive
    // either way — but the evaluator scores one Spearman per TIMESTAMP over the
    // whole cross-section present, and picks its basket from it. Leave crypto
    // in and a tradfi name is ranked against ~360 coins, so the pooled IC is
    // the crypto answer again and no tradfi name ever reaches the basket.
    if (allowed && !allowed.has(meta.category)) continue;
    if (bars.length < warmup + cfg.entryLag + cfg.horizon + 1) {
      tooShort++;
      continue;
    }
    const idxs: number[] = [];
    let anyLiquidityDrop = false;
    for (let i = 0; i < bars.length; i++) {
      if (!gridSet.has(bars[i].t)) continue;
      if (isEligible(bars, i, cfg, warmup)) idxs.push(i);
      else if (i >= warmup && i + cfg.entryLag + cfg.horizon < bars.length) {
        anyLiquidityDrop = true;
      }
    }
    if (anyLiquidityDrop && idxs.length === 0) illiquid++;
    if (idxs.length === 0) continue;
    eligible.set(symbol, idxs);
    nRows += idxs.length;
  }

  // ---- allocate ----
  const symbols = Array.from(eligible.keys());
  const symbolIdx = new Map(symbols.map((s, i) => [s, i]));
  const categories: PerpCategory[] = ["crypto", "equity", "premarket", "commodity", "index"];
  const catIdx = new Map(categories.map((c, i) => [c, i]));

  const nSig = signalNames.length;
  const values = new Float64Array(nSig * nRows).fill(NaN);
  const fwdGross = new Float64Array(nRows).fill(NaN);
  const fwdNet = new Float64Array(nRows).fill(NaN);
  const excess = new Float64Array(nRows).fill(NaN);
  const rowTime = new Int32Array(nRows);
  const rowSymbol = new Int32Array(nRows);
  const rowCategory = new Uint8Array(nRows);
  /** Kept for the cross-sectional pass, which needs the entry bar itself. */
  const rowBar = new Array<PerpBar | null>(nRows).fill(null);
  const rowAvgQVol = new Float64Array(nRows).fill(NaN);

  // ---- pass 2: fill ----
  let cursor = 0;
  for (const symbol of symbols) {
    const bars = payload.bars[symbol];
    const idxs = eligible.get(symbol)!;
    const meta = symbolMeta.get(symbol)!;
    const pos = positioning.get(symbol) ?? null;
    const ctx: SignalContext = { symbol, category: meta.category, positioning: pos };

    // Compute every per-symbol series once, then discard after writing rows.
    const series = perSymbolSpecs.map((spec) => ({
      spec,
      out: spec.compute(bars, ctx),
    }));

    for (const i of idxs) {
      const r = cursor++;
      rowTime[r] = gridSet.get(bars[i].t)!;
      rowSymbol[r] = symbolIdx.get(symbol)!;
      rowCategory[r] = catIdx.get(meta.category) ?? 0;

      const entryIdx = i + cfg.entryLag;
      const exitIdx = entryIdx + cfg.horizon;
      rowBar[r] = bars[entryIdx];

      let qsum = 0;
      let qn = 0;
      for (let j = Math.max(0, i - cfg.liquidityBars + 1); j <= i; j++) {
        if (Number.isFinite(bars[j].q)) {
          qsum += bars[j].q;
          qn++;
        }
      }
      rowAvgQVol[r] = qn ? qsum / qn : NaN;

      const entry = bars[entryIdx].c;
      const exit = bars[exitIdx].c;
      if (entry > 0 && exit > 0) {
        const gross = (100 * (exit - entry)) / entry;
        fwdGross[r] = gross;

        const fundingPct =
          cfg.fundingMode === "realized"
            ? pos
              ? fundingCostOver(pos.funding, bars[entryIdx].tClose, bars[exitIdx].tClose)
              : 0
            : ((meanFunding[symbol] ?? 0) * 100 * cfg.horizon) / 2;

        fwdNet[r] = gross - fundingPct - ROUND_TRIP_FEE_PCT;
      }

      for (let s = 0; s < series.length; s++) {
        const { spec, out } = series[s];
        if (i < spec.minBars) continue;
        const v = out[i];
        if (v !== null && Number.isFinite(v)) values[s * nRows + r] = v;
      }
    }
  }

  // ---- cross-sectional signals, per timestamp ----
  if (crossSpecs.length) {
    const rowsByTime = new Map<number, number[]>();
    for (let r = 0; r < nRows; r++) {
      const g = rowsByTime.get(rowTime[r]);
      if (g) g.push(r);
      else rowsByTime.set(rowTime[r], [r]);
    }
    for (const rows of Array.from(rowsByTime.values())) {
      const input = rows.map((r) => ({
        category: categories[rowCategory[r]],
        bar: rowBar[r] as PerpBar,
        avgQuoteVol: rowAvgQVol[r],
      }));
      crossSpecs.forEach((spec, k) => {
        if (spec.kind !== "crossSectional") return;
        const out = spec.computeAt(input);
        const col = perSymbolSpecs.length + k;
        rows.forEach((r, j) => {
          const v = out[j];
          if (v !== null && Number.isFinite(v)) values[col * nRows + r] = v;
        });
      });
    }
  }

  // ---- demean within (timestamp, category) ----
  const rowsByTime = new Map<number, number[]>();
  for (let r = 0; r < nRows; r++) {
    const g = rowsByTime.get(rowTime[r]);
    if (g) g.push(r);
    else rowsByTime.set(rowTime[r], [r]);
  }

  let timestampsUsable = 0;
  for (const rows of Array.from(rowsByTime.values())) {
    const usable = rows.filter((r) => Number.isFinite(fwdNet[r]));
    if (usable.length < cfg.minRows) continue;

    const byCat = new Map<number, number[]>();
    for (const r of usable) {
      const g = byCat.get(rowCategory[r]);
      if (g) g.push(r);
      else byCat.set(rowCategory[r], [r]);
    }
    let anyFilled = false;
    for (const group of Array.from(byCat.values())) {
      // A category too thin to define its own mean is left as NaN rather than
      // demeaned against a different asset class or against 4 peers.
      if (group.length < cfg.minPerCategory) continue;
      const m = mean(group.map((r) => fwdNet[r]));
      for (const r of group) excess[r] = fwdNet[r] - m;
      anyFilled = true;
    }
    if (anyFilled) timestampsUsable++;
  }

  const coverage = signalNames.map((_, s) => {
    let n = 0;
    for (let r = 0; r < nRows; r++) if (Number.isFinite(values[s * nRows + r])) n++;
    return nRows ? n / nRows : 0;
  });

  const rowsByCategory: Record<string, number> = {};
  let rowsWithExcess = 0;
  for (let r = 0; r < nRows; r++) {
    if (!Number.isFinite(excess[r])) continue;
    rowsWithExcess++;
    const c = categories[rowCategory[r]];
    rowsByCategory[c] = (rowsByCategory[c] ?? 0) + 1;
  }

  return {
    config: cfg,
    signalNames,
    times: grid,
    symbols,
    categories,
    nRows,
    rowTime,
    rowSymbol,
    rowCategory,
    values,
    fwdGross,
    fwdNet,
    excess,
    coverage,
    stats: {
      universe: Object.keys(payload.bars).length,
      tooShort,
      illiquid,
      timestampsSampled: grid.length,
      timestampsUsable,
      rowsByCategory,
      rowsWithExcess,
    },
  };
}

/** One signal's column as a view. */
export function col(panel: Panel, name: string): Float64Array {
  const s = panel.signalNames.indexOf(name);
  if (s < 0) throw new Error(`Panel has no signal "${name}"`);
  return panel.values.subarray(s * panel.nRows, (s + 1) * panel.nRows);
}

// ── disk cache ────────────────────────────────────────────────────────────
//
// JSON cannot hold this. `JSON.stringify` serialises a Float64Array as an
// OBJECT, and NaN becomes null, which reloads as 0 — every missing signal value
// would silently become a real reading of zero. So the numeric sections go to a
// raw binary sidecar and only the small metadata stays in JSON.
//
// Section order is Float64 first, then Int32, then Uint8, which keeps every
// typed-array view 8-byte aligned. Views are built from a COPIED slice rather
// than the pooled Buffer, because `new Float64Array(buf.buffer, buf.byteOffset)`
// throws unless the offset happens to be 8-aligned.

interface PanelHeader {
  version: number;
  endian: "LE" | "BE";
  config: PanelConfig;
  signalNames: string[];
  times: number[];
  symbols: string[];
  categories: string[];
  nRows: number;
  coverage: number[];
  stats: Panel["stats"];
}

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

export function panelCacheKey(cfg: PanelConfig, signalNames: string[]): string {
  return registryHash(signalNames, cfg as unknown as Record<string, unknown>);
}

export function savePanel(dir: string, panel: Panel): string {
  mkdirSync(dir, { recursive: true });
  const key = panelCacheKey(panel.config, panel.signalNames);
  const header: PanelHeader = {
    version: 1,
    endian: LITTLE_ENDIAN ? "LE" : "BE",
    config: panel.config,
    signalNames: panel.signalNames,
    times: panel.times,
    symbols: panel.symbols,
    categories: panel.categories,
    nRows: panel.nRows,
    coverage: panel.coverage,
    stats: panel.stats,
  };
  writeFileSync(join(dir, `panel-${key}.json`), JSON.stringify(header));

  const f64 = [panel.values, panel.fwdGross, panel.fwdNet, panel.excess];
  const total =
    f64.reduce((a, x) => a + x.byteLength, 0) +
    panel.rowTime.byteLength +
    panel.rowSymbol.byteLength +
    panel.rowCategory.byteLength;
  const buf = Buffer.allocUnsafe(total);
  let off = 0;
  for (const arr of f64) {
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(buf, off);
    off += arr.byteLength;
  }
  for (const arr of [panel.rowTime, panel.rowSymbol] as const) {
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(buf, off);
    off += arr.byteLength;
  }
  Buffer.from(
    panel.rowCategory.buffer,
    panel.rowCategory.byteOffset,
    panel.rowCategory.byteLength,
  ).copy(buf, off);

  writeFileSync(join(dir, `panel-${key}.bin`), buf);
  return key;
}

export function loadPanel(dir: string, key: string): Panel | null {
  const hPath = join(dir, `panel-${key}.json`);
  const bPath = join(dir, `panel-${key}.bin`);
  if (!existsSync(hPath) || !existsSync(bPath)) return null;

  const header = JSON.parse(readFileSync(hPath, "utf8")) as PanelHeader;
  if (header.version !== 1) return null;
  // The sidecar is platform-native; refuse rather than silently byte-swap.
  if (header.endian !== (LITTLE_ENDIAN ? "LE" : "BE")) return null;

  const buf = readFileSync(bPath);
  const n = header.nRows;
  const nSig = header.signalNames.length;

  let off = 0;
  const takeF64 = (len: number) => {
    const bytes = len * 8;
    const out = new Float64Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + bytes));
    off += bytes;
    return out;
  };
  const takeI32 = (len: number) => {
    const bytes = len * 4;
    const out = new Int32Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + bytes));
    off += bytes;
    return out;
  };

  const values = takeF64(nSig * n);
  const fwdGross = takeF64(n);
  const fwdNet = takeF64(n);
  const excess = takeF64(n);
  const rowTime = takeI32(n);
  const rowSymbol = takeI32(n);
  const rowCategory = new Uint8Array(
    buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + n),
  );

  return {
    config: header.config,
    signalNames: header.signalNames,
    times: header.times,
    symbols: header.symbols,
    categories: header.categories,
    nRows: n,
    rowTime,
    rowSymbol,
    rowCategory,
    values,
    fwdGross,
    fwdNet,
    excess,
    coverage: header.coverage,
    stats: header.stats,
  };
}

/** Row indices grouped by timestamp index, ascending — the unit of every test. */
export function rowsByTimestamp(panel: Panel): number[][] {
  const out = new Map<number, number[]>();
  for (let r = 0; r < panel.nRows; r++) {
    const g = out.get(panel.rowTime[r]);
    if (g) g.push(r);
    else out.set(panel.rowTime[r], [r]);
  }
  return Array.from(out.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, rows]) => rows);
}

/** Signals present on at least `floor` of rows — the searchable set. */
export function coveredSignals(panel: Panel, floor = 0.5): string[] {
  return panel.signalNames.filter((_, s) => panel.coverage[s] >= floor);
}

export const CACHE_DIR = join(process.cwd(), "tmp", "perp-backtest");
export const PANEL_DIR = join(process.cwd(), "tmp", "perp-panel");

/**
 * Loads a cached panel or builds one.
 *
 * The cache key hashes the registry names AND the full config, so changing a
 * signal, the horizon, the entry lag or the liquidity floor produces a
 * different file rather than silently answering a question about a pipeline
 * that no longer exists. The positioning fetch timestamp is folded in for the
 * same reason: the panel joins funding onto returns, so a refreshed
 * positioning file must invalidate every panel built from the old one.
 */
export function loadOrBuildPanel(
  cfg: PanelConfig,
  signals: PerpSignalSpec[] = PERP_SIGNALS,
  opts: { rebuild?: boolean; quiet?: boolean } = {},
): Panel {
  const barsFile = join(CACHE_DIR, "bars-4h.json");
  if (!existsSync(barsFile)) {
    throw new Error(
      `No bars at ${barsFile}. Run: npx tsx scripts/research/run-perp-convergence-backtest.ts --refresh`,
    );
  }

  const posFile = join(CACHE_DIR, "positioning.json");
  const posRaw = existsSync(posFile)
    ? (JSON.parse(readFileSync(posFile, "utf8")) as {
        fetchedAt: string;
        history: Record<string, PositioningHistory>;
      })
    : null;

  const names = signals.map((s) => s.name);
  const key = registryHash(names, {
    ...(cfg as unknown as Record<string, unknown>),
    positioningAt: posRaw?.fetchedAt ?? "none",
  });

  if (!opts.rebuild) {
    const cached = loadPanel(PANEL_DIR, key);
    if (cached) {
      if (!opts.quiet) console.log(`Panel cache hit (${key}), ${cached.nRows} rows.`);
      return cached;
    }
  }

  if (!opts.quiet) console.log(`Building panel ${key} (h=${cfg.horizon}, lag=${cfg.entryLag})...`);
  const payload = JSON.parse(readFileSync(barsFile, "utf8")) as BarPayload;

  const positioning = new Map<string, PositioningHistory>();
  if (posRaw) {
    for (const [sym, h] of Object.entries(posRaw.history)) positioning.set(sym, h);
  } else if (!opts.quiet) {
    console.log("  WARNING: no positioning.json — every attention signal will be empty.");
  }

  const fundingFile = join(CACHE_DIR, "funding.json");
  const meanFunding = existsSync(fundingFile)
    ? (JSON.parse(readFileSync(fundingFile, "utf8")) as Record<string, number>)
    : {};

  const panel = buildPanel(payload, positioning, meanFunding, cfg, signals);
  savePanelSafe(PANEL_DIR, panel, key, opts.quiet);
  return panel;
}

/** Saves under an explicit key, so the load path and the save path agree. */
function savePanelSafe(dir: string, panel: Panel, key: string, quiet?: boolean): void {
  mkdirSync(dir, { recursive: true });
  const header: PanelHeader = {
    version: 1,
    endian: LITTLE_ENDIAN ? "LE" : "BE",
    config: panel.config,
    signalNames: panel.signalNames,
    times: panel.times,
    symbols: panel.symbols,
    categories: panel.categories,
    nRows: panel.nRows,
    coverage: panel.coverage,
    stats: panel.stats,
  };
  writeFileSync(join(dir, `panel-${key}.json`), JSON.stringify(header));

  const f64 = [panel.values, panel.fwdGross, panel.fwdNet, panel.excess];
  const total =
    f64.reduce((a, x) => a + x.byteLength, 0) +
    panel.rowTime.byteLength +
    panel.rowSymbol.byteLength +
    panel.rowCategory.byteLength;
  const buf = Buffer.allocUnsafe(total);
  let off = 0;
  for (const arr of f64) {
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(buf, off);
    off += arr.byteLength;
  }
  for (const arr of [panel.rowTime, panel.rowSymbol] as const) {
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(buf, off);
    off += arr.byteLength;
  }
  Buffer.from(
    panel.rowCategory.buffer,
    panel.rowCategory.byteOffset,
    panel.rowCategory.byteLength,
  ).copy(buf, off);
  writeFileSync(join(dir, `panel-${key}.bin`), buf);
  if (!quiet) console.log(`  cached as panel-${key}.{json,bin}`);
}

/** Prints the diagnostics that must be read BEFORE any result. */
export function printPanelStats(panel: Panel): void {
  const s = panel.stats;
  console.log(
    `\nPanel: ${panel.nRows} rows · ${panel.symbols.length} symbols · ` +
      `${s.timestampsUsable}/${s.timestampsSampled} usable timestamps · ` +
      `${s.rowsWithExcess} rows with excess`,
  );
  console.log(
    `  horizon ${panel.config.horizon} bars (${((panel.config.horizon * 4) / 24).toFixed(1)}d) · ` +
      `entryLag ${panel.config.entryLag} · funding ${panel.config.fundingMode} · ` +
      `minPerCategory ${panel.config.minPerCategory} · liquidityFloor $${panel.config.liquidityFloor.toLocaleString("en-US")}`,
  );
  console.log(`  dropped: ${s.tooShort} too short, ${s.illiquid} never liquid enough`);

  // Printed first and unconditionally: a search that has quietly become
  // crypto-only must be visible before any number is read, not inferred later.
  const total = Object.values(s.rowsByCategory).reduce((a, b) => a + b, 0) || 1;
  console.log("  rows by category:");
  for (const [cat, n] of Object.entries(s.rowsByCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(10)} ${String(n).padStart(7)}  ${((100 * n) / total).toFixed(1)}%`);
  }
  for (const cat of ["equity", "premarket", "commodity", "index"]) {
    if (!s.rowsByCategory[cat]) {
      console.log(`    ${cat.padEnd(10)} ${"0".padStart(7)}  ABSENT — this study cannot speak to it`);
    }
  }
}

export { SIGNAL_BY_NAME };
