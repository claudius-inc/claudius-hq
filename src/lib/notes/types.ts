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
  /**
   * Share of this year's closes BELOW `level`, 0–100. A rank percentile, NOT a
   * position within `ytdLow`–`ytdHigh` — the two differ whenever the
   * distribution is skewed, which for VIX is always. Phrase it as "below N% of
   * this year's closes", never as "Nth percentile of the range".
   */
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
 * A name the day's ranking says matters (v2 §A), whether or not a reason was
 * retrieved for it. MOVERS renders these in rank order: a name with an
 * attribution carries its retrieved phrase, and the rest print the bare move —
 * which is §B rung 7, the correct output when nothing passed the ladder.
 */
export interface MoverName {
  ticker: string;
  changePct: number;
}

/**
 * A retrieved, dated, direction-checked reason for a single name's move (v2 §B).
 * The phrase CONTAINS its own ticker, which is what lets the prose rule be a
 * plain containment check. Composed by the assembler, rendered deterministically,
 * never authored or paraphrased by the model (§1b).
 */
export interface Attribution {
  ticker: string;
  rung: "earnings" | "rating" | "target" | "8k";
  /** "on" is causal and needs a signed, direction-matching event; "after" is temporal. */
  verb: "on" | "after";
  phrase: string;
  epsActual?: number;
  /** Present only when two sources agreed on the sign of the surprise. */
  epsEstimate?: number;
  firm?: string;
}

/**
 * One deterministic reading of a release's recent run.
 *
 * Stored as DATA, never as a rendered sentence. Seasonal factors are re-estimated
 * annually, so re-fetching FRED months later will not reproduce a stored
 * "3.1% 3-month annualized" — a frozen string plus a bare number is un-auditable,
 * while these fields carry their own inputs and stay checkable forever. It also
 * matches how `MacroRelease` already works: values here, formatting in the
 * component.
 */
export interface MacroContext {
  kind: "annualized" | "average" | "levelChange" | "publishedAverage" | "rank";
  value: number;
  /** How many periods the window spans. 3 for a 3-month annualized rate. */
  windowPeriods: number;
  /** Which series produced it — usually the seasonally adjusted twin, not the headline. */
  seriesId: string;
  /** The observation dates it was computed from, so the figure can be re-derived. */
  inputPeriods: string[];
  /** `rank` only: which extreme this print set. */
  extreme?: "high" | "low";
  /** `rank` only: "the fastest since February 2025". */
  sinceDate?: string;
}

/**
 * An economic release that printed today (v2 §E).
 *
 * Carries a street consensus when one could be sourced AND unambiguously joined
 * (see `nasdaq-consensus.ts`), and falls back to the prior alone when it could
 * not. The fallback wording must assert the BASIS — "measured against the prior
 * reading" — and never claim no consensus exists: that was true when §I was
 * written, it is false now, and new rendering code renders old notes.
 */
export interface MacroRelease {
  label: string;
  /** The observation period, e.g. "2026-07-01" for July data. */
  period: string;
  timeEt: string;
  actual: number;
  /**
   * The prior reading from the CURRENT vintage. FRED cannot transform across
   * vintages, so this is not the as-first-published figure — `priorRevised`
   * carries that caveat and must not be dropped.
   */
  prior: number;
  /** True when the current vintage of the prior differs from its first print. */
  priorRevised: boolean;
  suffix: string;
  dp: number;
  /** Whether a leading "+" belongs — true for changes, false for levels. */
  signed: boolean;
  /**
   * The survey median, when one was sourced and joined unambiguously. Absent
   * means we could not get one for THIS release — not that none exists.
   */
  consensus?: number;
  /** `actual − consensus`, in the series' own units. Present only with `consensus`. */
  surprise?: number;
  /**
   * When the consensus was captured. Survey medians drift as forecasters submit,
   * so the median at 18:15 ET on release day is not the median three days out, and
   * a note re-rendered months later must be able to say which one it quoted.
   */
  consensusAsOf?: string;
  /** Deterministic context from the series' own history. At most two entries. */
  context?: MacroContext[];
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

/**
 * Dealer gamma pin for THE BOOK (§4.8).
 *
 * `netGammaPositive` and `dealerGammaSign` are the SAME quantity under opposite
 * sign conventions, and exactly one of them is present on any given note. The
 * old field was computed as `put gamma − call gamma`, which is backwards; the
 * new one is `call − put`, the published convention. They are not both written,
 * because a field that means one thing on Tuesday and its opposite on Wednesday
 * is worse than two fields.
 *
 * Read `dealerGammaSign` when it exists. When it does not, the note predates the
 * correction and its stance claim is inverted — the renderer says so on the page
 * rather than silently flipping it, because the archived prose was itself
 * selected to agree with the wrong sign.
 */
export interface GexPinData {
  symbol: string;
  spot: number;
  pinStrike: number;
  /**
   * LEGACY, inverted. Present only on notes written before the sign fix, and
   * never written again. `true` on such a note means dealers were net SHORT
   * gamma under the corrected convention.
   */
  netGammaPositive?: boolean;
  /** +1 = dealers net long gamma (vol-dampening); −1 = short. */
  dealerGammaSign?: 1 | -1;
  /**
   * Signed dealer gamma AT `pinStrike`. Positive draws price toward the strike;
   * negative accelerates through it. Net gamma can be positive while the
   * heaviest strike is put-dominated, so this is what decides the wording.
   */
  pinGex?: number;
  /**
   * Spot at which total dealer gamma crosses zero — the nearest crossing to
   * spot. `null` means none was detected inside the search band, which is not
   * the same as none existing.
   */
  zeroGamma?: number | null;
  /** Longest expiry included, in days. Two notes are comparable only at equal horizons. */
  horizonDays?: number;
  /** Pin distance from spot, in percent. */
  distancePct: number;
  /** How many expirations were aggregated (each priced at its own dte). */
  expiriesUsed: number;
  /**
   * The same figures from the previous session, for the overnight delta — the
   * only genuine positioning FLOW read these sources allow. Omitted unless the
   * two notes are strictly comparable: same symbol, same sign convention, same
   * horizon, and no more than four sessions apart.
   */
  prior?: {
    date: string;
    pinStrike: number;
    dealerGammaSign: 1 | -1;
    zeroGamma: number | null;
  };
}

/**
 * A scheduled economic release for TOMORROW'S TELLS (§4.9), from FRED's release
 * calendar plus the Fed's own.
 *
 * Consensus reaches about one session forward and no further — measured, the
 * calendar is populated for tomorrow's print and blank four days out. So `expects`
 * is present for the next session and absent beyond it, and `range` is the
 * fallback that makes the line worth reading either way.
 */
export interface EconEvent {
  name: string;
  /** ET calendar date, YYYY-MM-DD. */
  date: string;
  /** ET clock time, HH:mm. */
  timeEt: string;
  /** The survey median, where one is published this far ahead. */
  expects?: {
    value: number;
    /** The last print, so the expectation has something to sit against. */
    prior: number;
    label: string;
    suffix: string;
    dp: number;
    signed: boolean;
    asOf: string;
  };
  /**
   * Twelve-month low and high of the headline transform, and the last print.
   * The fallback when no consensus is published yet, and the thing that says what
   * a new extreme would take.
   */
  range?: {
    label: string;
    last: number;
    low: number;
    high: number;
    suffix: string;
    dp: number;
    signed: boolean;
  };
}

/** An expanded sector block (§6) — push callout + web deep-dive. */
export interface SpotlightBlock {
  key: string;
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
  /**
   * Non-GICS industry ETFs shown alongside the sector board — semis today.
   *
   * Deliberately a SEPARATE field rather than extra rows in `sectors`. Every
   * downstream claim keyed off `sectors` is a claim about the eleven GICS
   * sectors: the top-2/bottom-2 tape, the 21-session leader line, and the
   * divergence benchmark each constituent is measured against. Folding SMH in
   * would make "semis was the best sector today" sayable, which is false — it is
   * a slice of Technology, and its members are already counted inside XLK.
   *
   * Absent on every note written before this field existed, so read it with `?.`
   * like any other optional section.
   */
  thematics: Fact<SectorPoint[]> | null;
  breadth: Fact<BreadthData> | null;
  divergence: Fact<DivergenceSector[]> | null;
  contribution: Fact<ContributionData> | null;
  gexPin: Fact<GexPinData> | null;
  econEvents: Fact<EconEvent[]> | null;
  spotlight: Fact<SpotlightBlock[]> | null;
  postMarket: Fact<PostMarketMove[]> | null;
  /** 5- and 21-session moves for the benchmarks (§D). Never labelled 1W/1M. */
  timeframes: Fact<TimeframeMove[]> | null;
  /** Economic releases that printed today, actual vs prior (§E). */
  macro: Fact<MacroRelease[]> | null;
  /** The day's most relevant names, in rank order (§A). Renders as MOVERS. */
  movers: Fact<MoverName[]> | null;
  /** Why the day's notable names moved (§B). Renderer-owned; never LLM prose. */
  attributions: Fact<Attribution[]> | null;
  /**
   * Company name for every ticker the note may mention — the §1b alias list.
   * Without it the containment test is trivially escaped: "AKAM fell after the
   * print" is caught and "Akamai fell after the print" is not, and the model has
   * no reason to prefer one form over the other.
   */
  companyNames: Record<string, string> | null;
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
