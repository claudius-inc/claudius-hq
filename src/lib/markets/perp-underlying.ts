/**
 * Binance tradfi perp base -> underlying Yahoo ticker.
 *
 * THIS FILE IS DATA, NOT A HEURISTIC, AND THAT IS DELIBERATE.
 *
 * A naive `base -> ticker` map was measured against Binance's own indexPrice
 * (/fapi/v1/premiumIndex) across all 154 deduped tradfi/index contracts on
 * 2026-08-10. It resolved SEVEN contracts to the WRONG INSTRUMENT, and every
 * one of those returned HTTP 200 from Yahoo with a plausible company name and a
 * plausible price — so nothing would have thrown, logged, or failed a type
 * check. The worst case, `ALL`, resolves to The Allstate Corporation ($267)
 * when the contract is a Binance altcoin index at $0.50.
 *
 * Never add an entry without checking the Yahoo price against the contract's
 * indexPrice. `verifyMapping` is that check.
 *
 * ON `fxScale`: it is for the VERIFICATION GATE ONLY, and it is a spot rate
 * snapshot, not a contract constant. It decays as FX moves. The daily trend
 * context deliberately does NOT use it — trend is computed in the underlying's
 * own listing currency, because an SMMA-200 over five years converted at a
 * single day's rate gives the listing-currency shape anyway, only mislabelled.
 * Computing in listing currency is honest and needs no FX time series.
 */

export type MappingStatus = "verified" | "no_underlying" | "rejected";

export interface UnderlyingMapping {
  /** Binance base asset, e.g. "NVDA". */
  base: string;
  /** Binance symbol, e.g. "NVDAUSDT". */
  symbol: string;
  /** Yahoo ticker; null when no underlying exists or none was identified. */
  yahoo: string | null;
  /** Multiply Yahoo price by this to reach perp units. Verification only. */
  fxScale: number;
  status: MappingStatus;
  /** Required for anything not plainly `verified`, and for every fxScale !== 1. */
  note?: string;
}

/** Verified 1:1 USD names. The perp is quoted in the underlying's USD price —
 *  no contract multiplier is involved. Measured deviation vs indexPrice was
 *  under 5% for every entry on 2026-08-10. */
const USD_DIRECT = [
  "AAOI", "AAPL", "ADBE", "ALAB", "AMAT", "AMD", "AMZN", "APP", "ARM", "ASML",
  "ASTS", "AVGO", "AXTI", "BABA", "BE", "BNC", "BX", "CAT", "CIEN", "COHR",
  "COIN", "COST", "CRDO", "CRM", "CRWD", "CRWV", "CSCO", "DELL", "DIS", "DKNG",
  "EBAY", "EWJ", "EWT", "EWY", "EWZ", "FLEX", "FLNC", "FWDI", "GEV", "GLW",
  "GME", "GOOGL", "GS", "HD", "HIMS", "HOOD", "HPE", "IBM", "INTC", "IREN",
  "IWM", "JPM", "KLAC", "KO", "KSTR", "LITE", "LLY", "LRCX", "META", "MRVL",
  "MSFT", "MSTR", "MU", "NBIS", "NFLX", "NOK", "NOW", "NVDA", "NVO", "ONDS",
  "ORCL", "PANW", "PENG", "PLTR", "PYPL", "QCOM", "QQQ", "RDDT", "RIVN",
  "RKLB", "SMCI", "SMH", "SNDK", "SNOW", "SOFI", "SONY", "SPY", "TER", "TSLA",
  "TSM", "TTWO", "TXN", "UBER", "URNM", "USAR", "V", "VRT", "WDC", "WEN",
  "WMT", "XBI", "XLE", "ZM",
];

/** Yahoo ticker differs from the Binance base, but the instrument is right. */
const USD_RENAMED: Record<string, string> = {
  BRKB: "BRK-B",
  BZ: "BZ=F", // Brent
  CL: "CL=F", // WTI
  COPPER: "HG=F",
  NATGAS: "NG=F",
  XAG: "SI=F",
  XAU: "GC=F",
  XPD: "PA=F",
  XPT: "PL=F",
};

/** Structurally decaying instruments. Mapped correctly, but their long-run
 *  daily trend is not comparable to an unlevered name — a 3x daily-reset ETF
 *  bleeds in any choppy tape regardless of the underlying's direction. */
const DECAYING: Record<string, string> = {
  BITO: "BTC futures ETF — roll decay, and it duplicates crypto-book exposure.",
  KORU: "3x leveraged ETF — daily-reset decay.",
  SOXL: "3x leveraged ETF — daily-reset decay.",
  SOXS: "3x inverse ETF — daily-reset decay.",
  SQQQ: "3x inverse ETF — daily-reset decay.",
  TBT: "2x inverse Treasury ETF — daily-reset decay.",
  TMF: "3x leveraged Treasury ETF — daily-reset decay.",
  TQQQ: "3x leveraged ETF — daily-reset decay.",
  TZA: "3x inverse ETF — daily-reset decay.",
  UVXY: "1.5x VIX futures ETF — structural roll decay, not an equity.",
};

/**
 * Leveraged single-stock ETFs whose base LOOKS like a typo for a real ticker
 * that is ALSO in this universe. Every one of these has been mistaken for its
 * underlying at least once. Do not "fix" them.
 */
const LOOKALIKE_ETFS: Record<string, string> = {
  INTW: 'GraniteShares 2x Long INTC, NOT Intel. INTC is a separate contract. Do not "correct" to INTC.',
  MUU: 'Direxion Daily MU Bull 2X, NOT Micron. MU is a separate contract. Do not "correct" to MU.',
  MVLL: 'GraniteShares 2x Long MRVL, NOT Marvell. MRVL is a separate contract. Do not "correct" to MRVL.',
  SNXX: 'Tradr 2X Long SNDK, NOT SanDisk. SNDK is a separate contract. Do not "correct" to SNDK.',
};

function entry(
  base: string,
  yahoo: string | null,
  fxScale: number,
  status: MappingStatus,
  note?: string,
): UnderlyingMapping {
  return { base, symbol: `${base}USDT`, yahoo, fxScale, status, note };
}

export const UNDERLYING_MAP: UnderlyingMapping[] = [
  ...USD_DIRECT.map((b) => entry(b, b, 1, "verified")),
  ...Object.entries(USD_RENAMED).map(([b, y]) => entry(b, y, 1, "verified")),
  ...Object.entries(DECAYING).map(([b, n]) => entry(b, b, 1, "verified", n)),
  ...Object.entries(LOOKALIKE_ETFS).map(([b, n]) => entry(b, b, 1, "verified", n)),

  // PayPay (Japan) — NOT PayPal. PYPL is a separate contract for PayPal.
  entry("PAYP", "PAYP", 1, "verified", 'PayPay Corporation (Japan), NOT PayPal. Do not "correct" to PYPL.'),

  // ── Contracts quoted in HKD, matching the Yahoo listing 1:1 ──────────────
  entry("HK0700", "0700.HK", 1, "verified",
    "Quoted in HKD, so it matches 0700.HK directly at fxScale 1. The separate TENCENT contract is the SAME underlying quoted in USD. Currency is a property of the CONTRACT, never of the underlying."),
  entry("HK1810", "1810.HK", 1, "verified", "Quoted in HKD, matching 1810.HK directly at fxScale 1, like HK0700."),

  // ── CORRECTED: the naive map resolved to the WRONG INSTRUMENT ────────────
  // Each returned HTTP 200 with a plausible name; only the indexPrice
  // cross-check caught them.
  entry("STXX", "STX", 1, "verified",
    'CORRECTED. The naive map resolves to "Tradr 2X Long STX Daily ETF" at $38.50, but the contract index is $812.95 — Seagate (STX) itself. The naive map would have attached a 2x ETF to an unlevered single-stock perp.'),
  entry("GIGADEV", "603986.SS", 0.16064635, "verified",
    'CORRECTED. Yahoo has no "GIGADEV". The underlying is GigaDevice Semiconductor, 603986.SS (Shanghai STAR), quoted in CNY against a USD contract. fxScale is the CNY->USD spot on 2026-08-10. This is NOT a no-underlying name.'),
  entry("SKHYNIX", "000660.KS", 0.000701075, "verified",
    "CORRECTED. Naive base->ticker found nothing. Underlying is 000660.KS (SK hynix), quoted in KRW against a USD contract — naive comparison deviated 142538%. fxScale is the KRW->USD spot on 2026-08-10."),
  entry("SAMSUNG", "005930.KS", 0.000701634, "verified",
    "CORRECTED. 005930.KS (Samsung Electronics), KRW against a USD contract; naive deviation 142424%. fxScale is the KRW->USD spot on 2026-08-10."),
  entry("HYUNDAI", "005380.KS", 0.000703816, "verified",
    "CORRECTED. 005380.KS (Hyundai Motor), KRW against a USD contract; naive deviation 141983%. fxScale is the KRW->USD spot on 2026-08-10."),
  entry("TENCENT", "0700.HK", 0.127020277, "verified",
    "CORRECTED. 0700.HK (Tencent), HKD against a USD contract — naive deviation 687%. The separate HK0700 contract is the same underlying quoted in HKD at fxScale 1. fxScale is the HKD->USD spot on 2026-08-10."),
  entry("POPMART", "9992.HK", 0.127378852, "verified",
    "CORRECTED. 9992.HK (Pop Mart International), HKD against a USD contract — naive deviation 684%. fxScale is the HKD->USD spot on 2026-08-10."),

  // ── Short-history underlyings: mapped correctly, but the EQUITY is young ──
  // These stay 4h-only until they clear the daily floor. That is a runtime
  // check against the stored bar count, not a hard-coded exclusion — CRCL and
  // BMNR clear 300 within ~2 weeks, STRC within ~6.
  entry("BMNR", "BMNR", 1, "verified", "Only 295 Yahoo daily bars as of 2026-08-10."),
  entry("CRCL", "CRCL", 1, "verified", "Only 295 Yahoo daily bars as of 2026-08-10."),
  entry("STRC", "STRC", 1, "verified", "Only 258 Yahoo daily bars as of 2026-08-10."),
  entry("SHAZ", "SHAZ", 1, "verified", "Only 119 Yahoo daily bars as of 2026-08-10."),
  entry("DRAM", "DRAM", 1, "verified", "Only 88 Yahoo daily bars as of 2026-08-10."),
  entry("BOT", "BOT", 1, "verified", "Only 62 Yahoo daily bars as of 2026-08-10."),
  entry("BSP", "BSP", 1, "verified", "Only 27 Yahoo daily bars as of 2026-08-10."),
  entry("SKHY", "SKHY", 1, "verified", "Only 21 Yahoo daily bars as of 2026-08-10."),

  // SPCX and CBRS: the EQUITY listed AFTER the perp onboarded, so Yahoo history
  // is strictly SHORTER than what Binance already provides. Fetching them would
  // make the series worse, not better.
  entry("SPCX", null, 1, "rejected",
    "SpaceX listed 2026-06-12, AFTER the perp onboarded 2026-05-21: 39 Yahoo daily bars vs 81 days of perp history. Backfilling would shorten the series. Revisit once the equity has ~300 bars (~2027-02)."),
  entry("CBRS", null, 1, "rejected",
    "Cerebras listed 2026-05-14, days before the perp onboarded 2026-05-19: 59 Yahoo bars. Same situation as SPCX."),

  // ── REJECTED: an underlying exists but was not identified ────────────────
  // `rejected`, not `no_underlying` — asserting no underlying exists would be
  // false and would stop anyone revisiting it.
  entry("MINIMAX", null, 1, "rejected",
    "Binance classifies this HK_EQUITY, so an underlying exists, but no Yahoo ticker matches the contract index of $41.32. Unidentified — do NOT guess."),
  entry("ZHIPU", null, 1, "rejected",
    "Binance classifies this HK_EQUITY, so an underlying exists, but no Yahoo ticker matches the contract index of $159.96. Unidentified — do NOT guess."),
  entry("BBX", null, 1, "rejected",
    "Yahoo has no \"BBX\". BBXIA ($3.85) and BBXIB ($5.00) both fail against the contract index of $9.05. Unidentified."),
  entry("QNTX", null, 1, "rejected",
    'Yahoo "QNTX" resolves to a MUTUALFUND with no price — exactly the false positive a naive map accepts. No quantum-computing ticker matches the contract index of $59.47. Unidentified.'),

  // ── NO UNDERLYING: nothing to map, now or ever ───────────────────────────
  entry("OPENAI", null, 1, "no_underlying",
    "No listed underlying. /fapi/v1/premiumIndex returns markPrice === indexPrice EXACTLY with funding pinned flat at 0.0050%, i.e. Binance derives the index from its own order book. There is no external reference to backfill. Do not synthesise a proxy basket."),
  entry("ANTHROPIC", null, 1, "no_underlying",
    "No listed underlying. markPrice === indexPrice exactly, funding flat at 0.0050% — index derived from Binance's own book."),
  entry("ALL", null, 1, "no_underlying",
    'Binance underlyingType=INDEX: an ALTCOIN INDEX at $0.50, not an equity. A naive map resolves "ALL" to The Allstate Corporation ($267), which returns HTTP 200 with a plausible name and price, so NOTHING would error — it would silently attach Allstate history to a crypto index perp. This entry exists to make that impossible.'),
  entry("BTCDOM", null, 1, "no_underlying",
    "Binance underlyingType=INDEX: BTC dominance index. No equity underlying by construction."),
];

/** Lookup by Binance symbol. */
export const MAPPING_BY_SYMBOL: Map<string, UnderlyingMapping> = new Map(
  UNDERLYING_MAP.map((m) => [m.symbol, m]),
);

/** Every mapping that has a Yahoo ticker worth fetching. */
export const FETCHABLE: UnderlyingMapping[] = UNDERLYING_MAP.filter(
  (m) => m.status === "verified" && m.yahoo !== null,
);

/**
 * Price-agreement threshold for the verification gate, in percent.
 *
 * 5, not 2. Nine correctly-mapped names exceed 2% purely from after-hours drift
 * between Yahoo's last print and Binance's index — FWDI 4.09%, AAOI 2.91%,
 * KORU 2.73%, RKLB 2.43%, KSTR 2.30%, BOT 2.28%, COHR 2.24%, AXTI 2.19%, LITE
 * 2.19%. A 2% gate would reject all nine good mappings.
 */
export const MAX_PRICE_DEVIATION_PCT = 5;

/** Deviation between a Yahoo price and the contract's index price, in percent. */
export function priceDeviationPct(
  yahooPrice: number,
  indexPrice: number,
  fxScale: number,
): number {
  const converted = yahooPrice * fxScale;
  if (!indexPrice) return Infinity;
  return Math.abs((100 * (converted - indexPrice)) / indexPrice);
}
