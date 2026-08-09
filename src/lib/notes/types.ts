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

/** One constituent bucking its sector (§5). */
export interface DivergenceName {
  ticker: string;
  name: string | null;
  changePct: number;
  /** Distance from the sector's own move, in percentage points. */
  gap: number;
}

/** A sector with a meaningful within-sector divergence (§5). */
export interface DivergenceSector {
  etf: string;
  sectorName: string;
  sectorChangePct: number;
  /** Direction of the SECTOR; `names` are the ones moving against it. */
  direction: "up" | "down";
  names: DivergenceName[];
}

/** Cap-weighted index contribution, post reconciliation gate (§8). */
export interface ContributionData {
  modelledPct: number;
  actualPct: number;
  topNames: string[];
  topPoints: number;
  exTopPct: number;
  flipsWithoutTop: boolean;
}

/**
 * A 5- and 21-session move (v2 §D). Deliberately not called 1W/1M — a holiday
 * week would make those labels false. Either figure is null when the raw and
 * adjusted series disagreed, which means a split or a data defect.
 */
export interface TimeframeMove {
  symbol: string;
  chg5s: number | null;
  chg21s: number | null;
  asOfDate: string;
}

/**
 * An extended-session move for a ticker the note already names (v2 §G).
 * Never introduces a name; annotates one. Indices are excluded — they have no
 * extended session.
 */
export interface PostMarketMove {
  ticker: string;
  /** Percent change vs the regular close. */
  changePct: number;
  /** ET clock of the last extended print, e.g. "6:14pm" — the claim is "as of" this. */
  asOfEt: string;
}

/** Dealer gamma pin for THE BOOK (§4.8). */
export interface GexPinData {
  symbol: string;
  spot: number;
  pinStrike: number;
  /** True = dealers net long gamma (vol-dampening). */
  netGammaPositive: boolean;
  /** Pin distance from spot, in percent. */
  distancePct: number;
  /** How many expirations were aggregated (each priced at its own dte). */
  expiriesUsed: number;
}

/** A scheduled economic release for TOMORROW'S TELLS (§4.9). */
export interface EconEvent {
  name: string;
  /** ET calendar date, YYYY-MM-DD. */
  date: string;
  /** ET clock time, HH:mm. */
  timeEt: string;
  consensus: number | null;
  previous: number | null;
}

/** An expanded sector block (§6) — push callout + web deep-dive. */
export interface SpotlightBlock {
  key: string;
  emoji: string;
  label: string;
  headlinePct: number | null;
  price: number | null;
  leaders: { ticker: string; changePct: number }[];
  laggards: { ticker: string; changePct: number }[];
  /** Related instrument (e.g. GDX for gold). */
  proxy: { ticker: string; changePct: number } | null;
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
  divergence: Fact<DivergenceSector[]> | null;
  contribution: Fact<ContributionData> | null;
  gexPin: Fact<GexPinData> | null;
  econEvents: Fact<EconEvent[]> | null;
  spotlight: Fact<SpotlightBlock[]> | null;
  postMarket: Fact<PostMarketMove[]> | null;
  /** 5- and 21-session moves for the benchmarks (§D). Never labelled 1W/1M. */
  timeframes: Fact<TimeframeMove[]> | null;
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
