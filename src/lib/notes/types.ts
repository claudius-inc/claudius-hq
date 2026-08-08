/**
 * Daily Market Note ("The Tape") — structured fact types.
 *
 * See docs/daily-note-spec.md §1a, §8. Every section is a `Fact<T>` carrying
 * provenance + timestamp so the renderer can enforce the data-integrity policy:
 * a section whose feed failed or returned non-authoritative data is `null` and
 * is OMITTED from the note — never approximated.
 */

/** A single datum with provenance. `null` at the section level means "omit". */
export interface Fact<T> {
  value: T;
  /** Human/machine source label, e.g. "Yahoo", "US Treasury", "WSJ Markets Diary". */
  source: string;
  /** ISO timestamp the underlying datum is "as of" (NOT fetch time). */
  asOf: string;
}

export interface IndexPoint {
  symbol: string; // ^GSPC
  name: string; // S&P 500
  close: number;
  changePct: number;
}

export interface RatesData {
  y2: number;
  y10: number;
  y30: number;
  chg2Bp: number;
  chg10Bp: number;
  chg30Bp: number;
  spread2s10Bp: number;
  spread2s10ChgBp: number;
}

export interface VixData {
  level: number;
  change: number;
  ytdLow: number;
  ytdHigh: number;
  /** 0–100 percentile of `level` within its YTD range. */
  percentile: number;
  /** Consecutive-session run in `trendDir` (e.g. "up 3 days"). */
  trendDays: number;
  trendDir: "up" | "down" | "flat";
}

export interface CrossAssetPoint {
  symbol: string; // DX-Y.NYB
  label: string; // DXY
  price: number;
  changePct: number | null;
}

export interface SectorPoint {
  etf: string; // XLE
  name: string; // Energy
  changePct: number;
}

export interface BreadthData {
  advances: number;
  declines: number;
  ratio: number; // advances / declines
  newHighs: number;
  newLows: number;
}

/**
 * The full deterministic fact set for one trading day. LLM prose (slice 2) and
 * the divergence/GEX/econ facts (slices 3–4) extend this; slice-1 fields are the
 * factual skeleton. A `null` section = omitted (§1a).
 */
export interface StructuredFacts {
  /** YYYY-MM-DD, US market date in America/New_York. */
  date: string;
  /** ISO time the note was assembled. */
  generatedAt: string;

  indices: Fact<IndexPoint[]> | null;
  rates: Fact<RatesData> | null;
  vix: Fact<VixData> | null;
  crossAsset: Fact<CrossAssetPoint[]> | null;
  sectors: Fact<SectorPoint[]> | null;
  breadth: Fact<BreadthData> | null;
}

/**
 * LLM-written prose (slice 2). Every number in these strings must map to a value
 * in StructuredFacts — enforced by the numeral validator (§8.3), not the prompt.
 * A field the validator can't clear is dropped; the hook falls back to a
 * deterministic template (never dropped — it's required, §4.1).
 */
export interface NoteProse {
  hook: string;
  curveRead?: string;
  whatMatters: string[];
  bull?: string;
  bear?: string;
  book?: string;
}
