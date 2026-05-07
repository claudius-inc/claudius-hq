/**
 * SGX yield-spread fetcher: STI dividend yield − SGS 10y yield.
 *
 * ── Why a yield spread for Singapore ───────────────────────────────────
 * The STI is income-heavy by construction: banks ~35%, REITs ~20% of
 * weighting. The "is this market attractive vs the alternatives" question
 * for a Singapore investor reduces almost entirely to: how much does the
 * index yield over the risk-free rate? A wide premium means equities are
 * compelling vs SGS; a negative spread means cash beats stocks for income.
 *
 * Direction semantics:
 *   - "supportive"  spread ≥ +0.50pp  (clearly positive premium)
 *   - "neutral"     -0.25pp ≤ spread < +0.50pp
 *   - "headwind"    spread < -0.25pp  (STI yields less than the 10y
 *                   risk-free; structural headwind)
 *
 * ── Sources (probe summary, May 2026) ─────────────────────────────────
 * Many "obvious" sources turned out to be unusable today:
 *   - MAS eservices.mas.gov.sg → entire domain in maintenance/failover
 *   - data.gov.sg datastore   → no SGS resource indexed via search APIs
 *   - FRED IRLTLT01SGM156N    → 404 (US series like DGS10 still resolve;
 *                               the SG OECD series has been retired)
 *   - Yahoo SGS symbols       → none of the common forms resolve
 *   - Stooq SG10y CSV         → now requires API key
 * What DOES work, verified by probe:
 *   - Yahoo `quote("ES3.SI")` → SPDR STI ETF, returns dividendYield (%);
 *     ES3.SI tracks the STI within a few bps. G3B.SI (Nikko AM) is the
 *     fallback proxy.
 *   - tradingeconomics.com/singapore/government-bond-yield → the
 *     server-rendered <meta name="description"> tag carries the latest
 *     yield in the form "rose/fell/stood at X.XX% on <date>". This is a
 *     scrape, but the meta tag is stable across their template revs.
 *
 * Caveat: neither source gives us a free historical daily series for the
 * spread, so `recent` is intentionally an empty array and the modal
 * renders a snapshot-only view. We surface this in `note`.
 *
 * ── Pattern (mirror of cn.ts / jp.ts / hk.ts) ──────────────────────────
 *   - Module under src/lib/markets/flows/{market}.ts
 *   - Exports a single `fetchSGXFlow()` returning `SGXFlowData | null`
 *   - Cache key:  markets:flows:sgx:yield_spread
 *   - TTL:        1h  (yields move slowly; 1h is gentle on TE)
 *   - Stale:      12 × TTL accepted on hard failure
 *   - Hard fail:  return null  → modal renders "data unavailable"
 */

import YahooFinance from "yahoo-finance2";

import { getCache, setCache } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";

const CACHE_KEY = "markets:flows:sgx:yield_spread";
const CACHE_TTL_SECONDS = 60 * 60; // 1h
const STALE_MULTIPLIER = 12; // 12h fallback on hard error

const STI_PROXY_PRIMARY = "ES3.SI"; // SPDR STI ETF
const STI_PROXY_FALLBACK = "G3B.SI"; // Nikko AM STI ETF

const TE_URL = "https://tradingeconomics.com/singapore/government-bond-yield";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SOURCE_NAME = "Yahoo (ES3.SI) + Trading Economics (SG 10Y)";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ── Public types ──────────────────────────────────────────────────────

export interface SGXFlowData {
  /** Discriminator. */
  metric: "sti_yield_spread";

  /** STI dividend yield, % (e.g. 3.85). Sourced from an STI ETF proxy. */
  stiYield: number;
  /** 10y SGS yield, % (e.g. 2.11). */
  sgs10yYield: number;
  /** Signed spread in percentage points: stiYield − sgs10yYield. */
  spread: number;

  /** Direction classification. See module header. */
  direction: "supportive" | "neutral" | "headwind";

  /** Daily/monthly history of the spread, oldest first. May be empty if
   *  no free historical series is available; the modal handles that. */
  recent: Array<{ date: string; spread: number }>;
  /** Frequency of the `recent` series. "snapshot" indicates no history. */
  recentFrequency: "daily" | "monthly" | "snapshot";

  /** Plain-English one-liner. */
  interpretation: string;

  /** Which ETF proxy provided the STI yield (e.g. "ES3.SI"). */
  stiProxy: string;
  /** ISO date stamp of the SGS yield (provided by Trading Economics). */
  sgsDate?: string;

  source: string;
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
  /** Caveat surfaced prominently in the modal. */
  note?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

interface QuoteShape {
  regularMarketPrice?: number;
  dividendYield?: number;
  trailingAnnualDividendYield?: number;
}

/**
 * Pull the STI ETF proxy's annualised dividend yield (%).
 *
 * Yahoo returns `dividendYield` for ETFs as a percent (e.g. 3.56 = 3.56%).
 * Older API revisions occasionally reported it as a fraction; we coerce
 * numbers < 1 by ×100 to be defensive.
 */
async function fetchSTIYield(): Promise<{ value: number; proxy: string }> {
  for (const sym of [STI_PROXY_PRIMARY, STI_PROXY_FALLBACK]) {
    try {
      const q = (await yahooFinance.quote(sym)) as QuoteShape | QuoteShape[];
      const quote = Array.isArray(q) ? q[0] : q;
      const raw =
        typeof quote?.dividendYield === "number"
          ? quote.dividendYield
          : typeof quote?.trailingAnnualDividendYield === "number"
            ? quote.trailingAnnualDividendYield
            : undefined;
      if (typeof raw === "number" && Number.isFinite(raw)) {
        // Coerce fractional form to percent if needed.
        const pct = raw < 1 ? raw * 100 : raw;
        return { value: pct, proxy: sym };
      }
    } catch (e) {
      logger.warn("markets/flows/sgx", `Yahoo quote failed for ${sym}`, {
        error: e,
      });
    }
  }
  throw new Error("STI yield unavailable from ES3.SI and G3B.SI");
}

/**
 * Scrape the SG 10y yield from Trading Economics' meta-description tag.
 * Pattern: "The yield on Singapore 10Y Bond Yield rose/fell/stood at
 * X.XX% on Month D, YYYY".
 */
async function fetchSGS10y(): Promise<{ value: number; date?: string }> {
  const r = await fetch(TE_URL, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!r.ok) {
    throw new Error(`Trading Economics HTTP ${r.status}`);
  }
  const html = await r.text();
  const meta =
    html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/)?.[1] ?? "";
  if (!meta) {
    throw new Error("Trading Economics: missing meta description");
  }
  // Primary pattern: "rose/fell/stood/etc to X.XX% on <date>"
  const m = meta.match(
    /(?:rose|fell|increased|decreased|jumped|edged|stood|was|stayed|held|declined)\s+(?:up\s+|down\s+)?(?:to|at)\s+([0-9]+\.[0-9]+)%[^.]*?on\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i,
  );
  if (m) {
    return { value: Number.parseFloat(m[1]!), date: m[2] };
  }
  // Fallback: any "X.XX%" near "yield"
  const m2 = meta.match(/yield[^0-9]+([0-9]+\.[0-9]+)%/i);
  if (m2) {
    return { value: Number.parseFloat(m2[1]!) };
  }
  throw new Error(
    `Trading Economics: could not parse SGS yield from meta (${meta.slice(0, 120)})`,
  );
}

function classifyDirection(spread: number): SGXFlowData["direction"] {
  if (spread >= 0.5) return "supportive";
  if (spread < -0.25) return "headwind";
  return "neutral";
}

function buildInterpretation(
  stiYield: number,
  sgs: number,
  spread: number,
  direction: SGXFlowData["direction"],
): string {
  const sti = stiYield.toFixed(2);
  const ten = sgs.toFixed(2);
  const sp = `${spread >= 0 ? "+" : ""}${spread.toFixed(2)}pp`;
  switch (direction) {
    case "supportive":
      return `STI yields ${sti}% vs SGS 10y at ${ten}% — a ${sp} premium for taking equity risk; supportive of the income-heavy STI.`;
    case "headwind":
      return `STI yields ${sti}% vs SGS 10y at ${ten}% — a ${sp} discount; risk-free SGS pays more than the index, a structural headwind.`;
    case "neutral":
    default:
      return `STI yields ${sti}% vs SGS 10y at ${ten}% — ${sp} spread is in the neutral band; equities offer little extra over risk-free.`;
  }
}

// ── Public fetcher ────────────────────────────────────────────────────

export async function fetchSGXFlow(): Promise<SGXFlowData | null> {
  // Fast path: serve fresh-cached data
  const cached = await getCache<SGXFlowData>(CACHE_KEY, CACHE_TTL_SECONDS);
  if (cached && !cached.isStale) return cached.data;

  try {
    const [sti, sgs] = await Promise.all([fetchSTIYield(), fetchSGS10y()]);

    const spread = sti.value - sgs.value;
    const direction = classifyDirection(spread);
    const interpretation = buildInterpretation(
      sti.value,
      sgs.value,
      spread,
      direction,
    );

    const data: SGXFlowData = {
      metric: "sti_yield_spread",
      stiYield: sti.value,
      sgs10yYield: sgs.value,
      spread,
      direction,
      recent: [],
      recentFrequency: "snapshot",
      interpretation,
      stiProxy: sti.proxy,
      sgsDate: sgs.date,
      source: SOURCE_NAME,
      fetchedAt: new Date().toISOString(),
      note: `STI yield is the trailing dividend yield of ${sti.proxy} (an STI tracker ETF) used as a proxy for the index. The 10y SGS yield is scraped from Trading Economics' server-rendered meta tag because no MAS / data.gov.sg / FRED endpoint currently exposes the series for free. Snapshot-only: free historical spread series is not available.`,
    };

    await setCache(CACHE_KEY, data);
    return data;
  } catch (e) {
    logger.error("markets/flows/sgx", "Failed to fetch SGX yield spread", {
      error: e,
    });
    // Stale fallback (12h)
    const stale = await getCache<SGXFlowData>(
      CACHE_KEY,
      CACHE_TTL_SECONDS * STALE_MULTIPLIER,
    );
    if (stale) return stale.data;
    return null;
  }
}
