/**
 * ASSEMBLE — deterministic fact collection for the daily note.
 * See docs/daily-note-spec.md §8 step 1. Numbers only; no LLM here.
 *
 * Slice 1 covers: indices, VIX (+YTD percentile/trend), cross-asset (16:00 ET
 * bar via intraday chart, NOT a send-time quote), sector-ETF tape, rates
 * (Treasury same-day feed), breadth (WSJ — source-gated, §1a).
 *
 * Every section returns a Fact<T> or null. A null section is OMITTED downstream
 * (§1a) — a failed feed never becomes an approximation.
 */
import YahooFinance from "yahoo-finance2";
import { desc, lt } from "drizzle-orm";
import { db, dailyNotes } from "@/db";
import { logger } from "@/lib/logger";
import { fetchBreadthData } from "@/lib/markets/breadth";
import { rankRelevance, type RelevanceInput, type RelevanceScore } from "@/lib/notes/relevance";
import { fetchTimeframes } from "@/lib/notes/timeframes";
import { toYahooSymbol } from "@/lib/notes/sources/daily-bars";
import { placeEarnings, isReactionDay } from "@/lib/notes/earnings-window";
import type { ConstituentQuote } from "@/lib/notes/divergence";
import { fetchRatesFact } from "@/lib/notes/sources/treasury";
import { fetchYahooRatesFact } from "@/lib/notes/sources/yahoo-rates";
import { computeDivergenceFacts } from "@/lib/notes/divergence";
import { fetchGexPinFact } from "@/lib/notes/sources/gex-pin";
import { fetchMacroReleases, fetchUpcomingReleases, fomcHorizonHealth } from "@/lib/notes/sources/fred-releases";
import { missingFromRegistry, type ConnectorHealth } from "@/lib/notes/health";
import { fetchEarningsCalendar } from "@/lib/notes/sources/earnings-calendar";
import { buildAttributions } from "@/lib/notes/attribution";
import { loadEnabledSpotlights, buildSpotlightBlocks } from "@/lib/notes/spotlight";
import { etDate, etStamp, etMinutes, toMs } from "@/lib/notes/session";
import type {
  Fact,
  IndexPoint,
  CrossAssetPoint,
  SectorPoint,
  VixData,
  BreadthData,
  StructuredFacts,
  DivergenceSector,
  SpotlightBlock,
  PostMarketMove,
  ContributionData,
  MoverName,
  GexPinData,
} from "@/lib/notes/types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/assemble";

const INDICES: { symbol: string; name: string }[] = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "Nasdaq" },
  { symbol: "^DJI", name: "Dow" },
  { symbol: "^RUT", name: "Russell 2000" },
];

const SECTOR_ETFS: { etf: string; name: string }[] = [
  { etf: "XLK", name: "Technology" },
  { etf: "XLF", name: "Financials" },
  { etf: "XLY", name: "Consumer Disc" },
  { etf: "XLC", name: "Comm Svcs" },
  { etf: "XLV", name: "Health Care" },
  { etf: "XLI", name: "Industrials" },
  { etf: "XLP", name: "Consumer Staples" },
  { etf: "XLE", name: "Energy" },
  { etf: "XLB", name: "Materials" },
  { etf: "XLRE", name: "Real Estate" },
  { etf: "XLU", name: "Utilities" },
];

/**
 * Industry ETFs that are NOT GICS sectors but move like one — see
 * `StructuredFacts.thematics` for why they are kept out of `SECTOR_ETFS`.
 *
 * Semis is the case that forced this: XLK is a third Apple and Microsoft, so a
 * day where semiconductors run 3% and software falls is a flat Technology
 * print, and the board says nothing happened. Each entry here is an industry
 * whose move is regularly the opposite of the sector containing it.
 *
 * Adding one is a single line. Candidates that clear the same bar: IGV
 * (software — the other half of the AI trade), XBI (equal-weight biotech, where
 * XLV is mega-cap pharma), KRE (regional banks, where XLF is money-centre),
 * XRT (retail, where XLY is Amazon and Tesla).
 */
const THEMATIC_ETFS: { etf: string; name: string }[] = [{ etf: "SMH", name: "Semiconductors" }];

const CROSS_ASSETS: { symbol: string; label: string }[] = [
  { symbol: "DX-Y.NYB", label: "DXY" },
  { symbol: "GC=F", label: "Gold" },
  { symbol: "CL=F", label: "Crude" },
  // Copper is here as a cross-asset print in its own right, and because the
  // Materials sector has no other defensible partner: any future statement
  // relating XLB to a commodity has to be checkable against a registered
  // numeral, and an unregistered one would be dropped at validation (§H0.1).
  { symbol: "HG=F", label: "Copper" },
  { symbol: "BTC-USD", label: "BTC" },
];

interface QuoteLike {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  /** Used to derive the session's real close, which moves on a half-day. */
  regularMarketTime?: Date | number | string;
}

const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

// ── Indices + sector ETFs: one batch quote ──────────────────────────────────
async function fetchBatchQuoteMap(symbols: string[]): Promise<Map<string, QuoteLike>> {
  const out = new Map<string, QuoteLike>();
  const res = (await yahooFinance.quote(symbols)) as QuoteLike | QuoteLike[];
  for (const q of Array.isArray(res) ? res : [res]) {
    if (q?.symbol) out.set(q.symbol, q);
  }
  return out;
}

function indicesFact(map: Map<string, QuoteLike>, marketDate: string, now: number): Fact<IndexPoint[]> | null {
  const pts: IndexPoint[] = [];
  for (const { symbol, name } of INDICES) {
    const q = map.get(symbol);
    if (!q?.regularMarketPrice || q.regularMarketChangePercent == null) continue;
    if (!Number.isFinite(q.regularMarketPrice) || !Number.isFinite(q.regularMarketChangePercent)) continue;
    pts.push({ symbol, name, close: round(q.regularMarketPrice), changePct: round(q.regularMarketChangePercent) });
  }
  if (pts.length === 0) return null;
  return { value: pts, source: "Yahoo", asOf: etStamp(marketDate, "16:00:00", now) };
}

function sectorsFact(map: Map<string, QuoteLike>, marketDate: string, now: number): Fact<SectorPoint[]> | null {
  const pts: SectorPoint[] = [];
  for (const { etf, name } of SECTOR_ETFS) {
    const q = map.get(etf);
    if (q?.regularMarketChangePercent == null || !Number.isFinite(q.regularMarketChangePercent)) continue;
    const price = q.regularMarketPrice;
    pts.push({
      etf,
      name,
      changePct: round(q.regularMarketChangePercent),
      price: price != null && Number.isFinite(price) ? round(price) : undefined,
    });
  }
  // A partial board can't support a market-wide "top-2 / bottom-2" claim (§1a):
  // require the full 11 sectors or omit.
  if (pts.length !== SECTOR_ETFS.length) return null;
  return { value: pts, source: "Yahoo", asOf: etStamp(marketDate, "16:00:00", now) };
}

/**
 * The thematic strip. Unlike `sectorsFact` this does NOT demand a complete set:
 * no claim is made across these rows — they are read one at a time — so a
 * missing quote costs one line rather than invalidating the block.
 */
function thematicsFact(map: Map<string, QuoteLike>, marketDate: string, now: number): Fact<SectorPoint[]> | null {
  const pts: SectorPoint[] = [];
  for (const { etf, name } of THEMATIC_ETFS) {
    const q = map.get(etf);
    if (q?.regularMarketChangePercent == null || !Number.isFinite(q.regularMarketChangePercent)) continue;
    const price = q.regularMarketPrice;
    pts.push({
      etf,
      name,
      changePct: round(q.regularMarketChangePercent),
      price: price != null && Number.isFinite(price) ? round(price) : undefined,
    });
  }
  if (pts.length === 0) return null;
  return { value: pts, source: "Yahoo", asOf: etStamp(marketDate, "16:00:00", now) };
}

// ── VIX with YTD percentile + trend run ─────────────────────────────────────
async function vixFact(marketDate: string, now: number): Promise<Fact<VixData> | null> {
  try {
    const [quote, hist] = await Promise.all([
      yahooFinance.quote("^VIX") as Promise<{ regularMarketPrice?: number; regularMarketChange?: number }>,
      yahooFinance.chart("^VIX", {
        period1: new Date(`${marketDate.slice(0, 4)}-01-01`),
        interval: "1d",
      }) as Promise<{ quotes?: { close?: number | null }[] }>,
    ]);
    const level = quote?.regularMarketPrice;
    const change = quote?.regularMarketChange;
    if (level == null || change == null) return null;

    const closes = (hist?.quotes ?? [])
      .map((q) => q.close)
      .filter((c): c is number => c != null);
    if (closes.length < 20) return null;

    const ytdLow = Math.min(...closes);
    const ytdHigh = Math.max(...closes);
    const below = closes.filter((c) => c < level).length;
    const percentile = Math.round((below / closes.length) * 100);

    // Consecutive same-direction run ending on the latest close.
    let trendDir: VixData["trendDir"] = "flat";
    let trendDays = 0;
    for (let i = closes.length - 1; i > 0; i--) {
      const d = closes[i] - closes[i - 1];
      const s: VixData["trendDir"] = d > 0 ? "up" : d < 0 ? "down" : "flat";
      if (i === closes.length - 1) {
        trendDir = s;
        trendDays = 1;
      } else if (s === trendDir && s !== "flat") {
        trendDays++;
      } else break;
    }

    return {
      value: {
        level: round(level),
        change: round(change),
        ytdLow: round(ytdLow),
        ytdHigh: round(ytdHigh),
        percentile,
        trendDays,
        trendDir,
      },
      source: "Yahoo",
      asOf: etStamp(marketDate, "16:00:00", now),
    };
  } catch (error) {
    logger.error(SRC, "VIX fact failed", { error });
    return null;
  }
}

// ── Cross-asset: the 16:00 ET bar from an intraday chart ────────────────────
/** Last bar on ET date `day` at or before 16:00 ET. */
function closeBarOn(bars: { date: Date; close: number }[], day: string): { date: Date; close: number } | null {
  let chosen: { date: Date; close: number } | null = null;
  for (const b of bars) {
    const ms = b.date.getTime();
    if (etDate(ms) !== day) continue;
    if (etMinutes(ms) > 16 * 60) continue;
    if (!chosen || ms > chosen.date.getTime()) chosen = b;
  }
  return chosen;
}

async function crossAssetPoint(
  symbol: string,
  label: string,
  now: number,
): Promise<{ pt: CrossAssetPoint; barMs: number } | null> {
  try {
    // ~75h so a Monday run reaches Friday's session for the prior-close base.
    const chart = (await yahooFinance.chart(symbol, {
      period1: new Date(now - 75 * 60 * 60 * 1000),
      interval: "5m",
    })) as { quotes?: { date?: Date; close?: number | null }[] };
    const bars = (chart?.quotes ?? []).filter(
      (q): q is { date: Date; close: number } =>
        q?.date != null && q.close != null && Number.isFinite(q.close),
    );
    if (bars.length === 0) return null;

    const targetDate = etDate(now);
    // The 16:00 ET "close" bar on the target session. NEVER trust meta.previousClose:
    // after the 18:00 ET futures reopen it rolls to the new session (B1/M1).
    let chosen = closeBarOn(bars, targetDate);
    if (!chosen) {
      // No same-day close bar: only BTC (24/7) has no discrete close, so use its
      // latest bar. For futures/DXY, omit rather than ship a live/stale price.
      if (symbol !== "BTC-USD") return null;
      chosen = bars[bars.length - 1];
    }

    // Base = the prior ET trading date's close bar (from the same series).
    const priorDates = Array.from(new Set(bars.map((b) => etDate(b.date.getTime()))))
      .filter((d) => d < targetDate)
      .sort();
    const priorDate = priorDates[priorDates.length - 1];
    const base = priorDate ? closeBarOn(bars, priorDate)?.close ?? null : null;

    const price = round(chosen.close, symbol === "BTC-USD" ? 0 : 2);
    const changePct = base != null && base !== 0 ? round(((chosen.close - base) / base) * 100) : null;
    return { pt: { symbol, label, price, changePct }, barMs: chosen.date.getTime() };
  } catch (error) {
    logger.warn(SRC, `cross-asset ${label} failed`, { error });
    return null;
  }
}

async function crossAssetFact(now: number): Promise<Fact<CrossAssetPoint[]> | null> {
  const results = await Promise.all(CROSS_ASSETS.map((c) => crossAssetPoint(c.symbol, c.label, now)));
  const ok = results.filter((r): r is { pt: CrossAssetPoint; barMs: number } => r != null);
  if (ok.length === 0) return null;
  const asOfMs = Math.max(...ok.map((r) => r.barMs));
  return { value: ok.map((r) => r.pt), source: "Yahoo", asOf: new Date(asOfMs).toISOString() };
}

// ── Breadth: WSJ-sourced only (§1a) ─────────────────────────────────────────
async function breadthFact(marketDate: string, now: number): Promise<Fact<BreadthData> | null> {
  try {
    const b = await fetchBreadthData();
    // §1a: reject the fabricated ETF-estimate fallback (and never touch mcclellan).
    if (b.source !== "WSJ Markets Diary") {
      logger.warn(SRC, "Breadth omitted — not WSJ-sourced", { source: b.source });
      return null;
    }
    // §1a staleness: the WSJ diary date must be today-ET (a cached 200 lags).
    if (b.asOfDate !== marketDate) {
      logger.warn(SRC, "Breadth omitted — WSJ date is not today", { wsjDate: b.asOfDate, marketDate });
      return null;
    }
    const ad = b.advanceDecline;
    const hl = b.newHighsLows;
    // NaN slips past `== null` (breadth.ts parseNum → NaN → fabricated ratio=2).
    const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
    if (![ad.advances, ad.declines, ad.ratio, hl.newHighs, hl.newLows].every(finite)) {
      logger.warn(SRC, "Breadth omitted — non-finite counts", { ad, hl });
      return null;
    }
    return {
      value: {
        advances: ad.advances!,
        declines: ad.declines!,
        ratio: ad.ratio!,
        newHighs: hl.newHighs!,
        newLows: hl.newLows!,
      },
      source: "WSJ Markets Diary",
      asOf: etStamp(marketDate, "16:00:00", now),
    };
  } catch (error) {
    logger.error(SRC, "Breadth fact failed", { error });
    return null;
  }
}

/**
 * The assembled facts, and how each connector behaved getting them.
 *
 * Health rides ALONGSIDE the facts rather than inside them. `StructuredFacts` is
 * persisted per session and re-rendered months later, so embedding operational
 * state would bloat every archived note and put unregistered numerals next to the
 * renderer.
 */
export interface AssembleResult {
  facts: StructuredFacts;
  health: ConnectorHealth[];
}

/**
 * Race a fetch against a deadline.
 *
 * A connector that never resolves stalls the whole pipeline, and then no digest is
 * composed and nothing is ever reported — so a timeout is a PRECONDITION for
 * "down" being detectable at all, not a refinement. The abandoned promise lingers;
 * the run proceeds, which is the actual requirement. Same shape as `write.ts`'s
 * DeepSeek guard.
 */
async function capped<T>(label: string, ms: number, p: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      logger.warn(SRC, `${label} exceeded ${ms}ms — continuing without it`);
      resolve(fallback);
    }, ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Generous enough that a slow-but-working feed is never cut off. */
const CONNECTOR_TIMEOUT_MS = 90_000;

/** Assemble the full deterministic fact set for `marketDate` (YYYY-MM-DD, ET). */
export async function assembleFacts(marketDate: string, now = Date.now()): Promise<AssembleResult> {
  const health: ConnectorHealth[] = [];
  const quoteSymbols = [
    ...INDICES.map((i) => i.symbol),
    ...SECTOR_ETFS.map((s) => s.etf),
    ...THEMATIC_ETFS.map((s) => s.etf),
  ];

  const [quoteMap, vix, crossAsset, rates, breadth] = await Promise.all([
    capped(
      "Yahoo quotes",
      CONNECTOR_TIMEOUT_MS,
      fetchBatchQuoteMap(quoteSymbols).catch((error) => {
        logger.error(SRC, "Batch quote failed", { error });
        return new Map<string, QuoteLike>();
      }),
      new Map<string, QuoteLike>(),
    ),
    capped("Yahoo VIX", CONNECTOR_TIMEOUT_MS, vixFact(marketDate, now), null),
    capped("Yahoo cross-asset", CONNECTOR_TIMEOUT_MS, crossAssetFact(now), null),
    capped(
      "Treasury yields",
      CONNECTOR_TIMEOUT_MS,
      // Authoritative Treasury curve first; Yahoo's provisional 10Y/30Y only when
      // the par CSV has not published yet. The back-fill later swaps the
      // provisional print for the full Treasury curve (see run-rates-backfill).
      fetchRatesFact(marketDate).then((t) => t ?? fetchYahooRatesFact(marketDate)),
      null,
    ),
    capped("WSJ breadth", CONNECTOR_TIMEOUT_MS, breadthFact(marketDate, now), null),
  ]);

  const indices = indicesFact(quoteMap, marketDate, now);
  const sectors = sectorsFact(quoteMap, marketDate, now);
  const thematics = thematicsFact(quoteMap, marketDate, now);

  // A partial quote batch is worse than a failed one: the sector board silently
  // omits rather than erroring, so coverage is the signal, not an exception.
  health.push({
    name: "Yahoo quotes",
    status: quoteMap.size === 0 ? "down" : quoteMap.size < quoteSymbols.length ? "degraded" : "ok",
    detail: quoteMap.size === 0 ? "no quotes returned" : quoteMap.size < quoteSymbols.length ? "partial batch" : undefined,
    itemsExpected: quoteSymbols.length,
    itemsGot: quoteMap.size,
  });
  health.push({ name: "Yahoo VIX", status: vix ? "ok" : "down", detail: vix ? undefined : "no VIX quote or history" });
  health.push({
    name: "Yahoo cross-asset",
    status: crossAsset ? (crossAsset.value.length < 5 ? "degraded" : "ok") : "down",
    detail: crossAsset && crossAsset.value.length < 5 ? "some instruments had no 16:00 ET bar" : crossAsset ? undefined : "no instruments resolved",
    itemsExpected: CROSS_ASSETS.length,
    itemsGot: crossAsset?.value.length ?? 0,
  });
  health.push({
    name: "Treasury yields",
    status: rates ? (rates.value.provisional ? "degraded" : "ok") : "down",
    detail: rates
      ? rates.value.provisional
        ? "Treasury CSV not published; provisional Yahoo 10Y/30Y (awaiting back-fill)"
        : undefined
      : "no same-day yields",
  });
  // Breadth is source-gated (§1a): a non-WSJ or stale answer is REJECTED upstream,
  // so a null here already means "answered wrong" as often as "did not answer".
  health.push({
    name: "WSJ breadth",
    status: breadth ? "ok" : "degraded",
    detail: breadth ? undefined : "rejected — not WSJ-sourced, stale, or non-finite (see log)",
  });

  // Divergence + contribution need the sector benchmarks and the index move,
  // so they run after the batch quote resolves (§5, §8).
  const spChange = indices?.value.find((i) => i.symbol === "^GSPC")?.changePct ?? null;
  const { divergence, contribution, moversBySector, postMarketByTicker, constituents } =
    await computeDivergenceFacts(sectors?.value ?? null, spChange, marketDate);
  const asOf = etStamp(marketDate, "16:00:00", now);

  // Slice-4 depth: gamma pin, next-session econ releases, spotlight blocks.
  // Each degrades to null independently (§1a) — the section is simply omitted.
  const nextDay = new Date(now + 86_400_000);
  const nextDate = etDate(nextDay.getTime());
  const [gexPin, econRes, enabledSpotlights, macroRes] = await Promise.all([
    fetchGexPinFact(asOf),
    // Window covers the next few calendar days so a Friday note reaches Monday.
    // `marketDate` is passed separately as the realtime anchor: FRED rejects a
    // realtime period that starts in the future, which this window always does.
    fetchUpcomingReleases(nextDate, etDate(now + 4 * 86_400_000), marketDate, asOf),
    loadEnabledSpotlights(),
    fetchMacroReleases(marketDate, asOf),
  ]);
  const econEvents = econRes.fact;
  const macro = macroRes.fact;
  health.push(...econRes.health, ...macroRes.health);
  health.push(fomcHorizonHealth(marketDate));
  health.push(
    gexPin
      ? { name: "SPY option chain", status: "ok", itemsGot: gexPin.value.expiriesUsed }
      : { name: "SPY option chain", status: "degraded", detail: "no usable chain — see the gex-pin log for which guard tripped" },
  );

  // The overnight positioning delta. Attached here rather than inside
  // `fetchGexPinFact` because it is the only part of THE BOOK that needs the
  // database, and the fetcher is otherwise a pure Yahoo call.
  await attachPriorPin(gexPin, marketDate);

  // §A relevance + §D timeframes. The relevance ranking is computed from data
  // already in hand; the timeframe bars are the only new fetch, and they cover
  // the ~20 benchmarks plus the capped relevance union — never the full index,
  // which would be hundreds of history calls.
  const priorSessionDate = await fetchPriorSessionDate(marketDate);
  const closeMinute = closeMinuteFor(quoteMap);
  const relevance = rankConstituents(constituents, sectors?.value ?? null, marketDate, priorSessionDate, closeMinute);
  const benchmarks = [
    ...INDICES.map((i) => i.symbol),
    ...SECTOR_ETFS.map((s) => s.etf),
    ...THEMATIC_ETFS.map((s) => s.etf),
    ...CROSS_ASSETS.map((c) => c.symbol),
    "^VIX",
  ];
  // Benchmarks AND the relevance union, in one pass (§D). The union is capped
  // at 15, so this is ~36 sequential chart calls rather than ~21 — about three
  // extra seconds against a twelve-minute budget.
  const unionSymbols = relevance.map((r) => toYahooSymbol(r.ticker));
  const timeframes = await fetchTimeframes([...benchmarks, ...unionSymbols], marketDate);

  // §B attribution. The relevance ranking decides WHICH names deserve a reason;
  // the calendar window reaches back a session so an after-close report from
  // yesterday is found as today's reaction.
  const sectorPct = new Map((sectors?.value ?? []).map((s) => [s.etf, s.changePct]));
  const earningsCal = await fetchEarningsCalendar(priorSessionDate ?? marketDate, marketDate);
  const attributions = await buildAttributions(
    relevance
      .map((r) => {
        const c = constituents.find((x) => x.ticker === r.ticker);
        const sp = sectorPct.get(r.sectorEtf);
        return c && sp != null
          ? {
              ticker: r.ticker,
              changePct: r.changePct,
              sectorEtf: r.sectorEtf,
              sectorPct: sp,
              sectorWeight: c.sectorWeight,
              earningsStamp: c.earningsStamp,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null),
    earningsCal,
    marketDate,
    priorSessionDate,
    closeMinute,
  );

  // SPDR holdings drives divergence, contribution and the relevance ranking, so a
  // stale seed silently disables three sections at once.
  health.push({
    name: "SPDR holdings",
    status: constituents.length === 0 ? "down" : constituents.length < 400 ? "degraded" : "ok",
    detail:
      constituents.length === 0
        ? "no constituents — seed missing or rejected as too stale"
        : constituents.length < 400
          ? "partial quote coverage across the index"
          : undefined,
    itemsGot: constituents.length,
  });
  // Attribution legitimately does nothing when the ranking found nobody. That is
  // `skipped`, not a failure — but the reason travels with it, because on a run
  // with failures the cascade has to read as one story.
  health.push(
    relevance.length === 0
      ? {
          name: "Attribution",
          status: "skipped",
          detail: constituents.length === 0 ? "relevance ranked nothing (SPDR holdings was down)" : "relevance ranked no names",
        }
      : { name: "Attribution", status: "ok", itemsExpected: relevance.length, itemsGot: attributions.length },
  );

  // §A's ranking is what decides which names deserve a line at all. Persisting
  // it — not just the subset that earned an attribution — is what lets MOVERS
  // honour §B rung 7: a name that cleared the ranking but whose reason failed
  // every rung still prints, bare. Suppressing it instead would quietly make
  // "we found a reason" the condition for being mentioned.
  const movers: MoverName[] = relevance.map((r) => ({
    ticker: r.ticker,
    changePct: r.changePct,
  }));

  const spotlightBlocks = await buildSpotlightBlocks({
    enabled: enabledSpotlights,
    sectors: sectors?.value ?? null,
    crossAsset: crossAsset?.value ?? null,
    divergence,
    movers: moversBySector,
  });

  const facts: StructuredFacts = {
    date: marketDate,
    generatedAt: new Date(now).toISOString(),
    indices,
    rates,
    vix,
    crossAsset,
    sectors,
    thematics,
    breadth,
    divergence: divergence.length > 0 ? { value: divergence, source: "Yahoo + SPDR holdings", asOf } : null,
    contribution: contribution ? { value: contribution, source: "Yahoo + SPY float weights", asOf } : null,
    gexPin,
    econEvents,
    spotlight: spotlightBlocks.length > 0 ? { value: spotlightBlocks, source: "Yahoo + spotlight config", asOf } : null,
    postMarket: postMarketFact(postMarketByTicker, divergence, spotlightBlocks, contribution),
    movers: movers.length > 0 ? { value: movers, source: "Yahoo + SPDR holdings (relevance rank)", asOf } : null,
    companyNames: buildCompanyNames(constituents, [
      ...movers.map((m) => m.ticker),
      ...attributions.map((a) => a.ticker),
      ...divergence.flatMap((d) => d.names.map((n) => n.ticker)),
      ...(contribution?.topNames ?? []),
      ...spotlightBlocks.flatMap((s) => [
        ...s.leaders.map((n) => n.ticker),
        ...s.laggards.map((n) => n.ticker),
        ...(s.proxy ? [s.proxy.ticker] : []),
      ]),
    ]),
    timeframes: timeframes.length > 0 ? { value: timeframes, source: "Yahoo daily bars (adjusted)", asOf } : null,
    macro,
    attributions:
      attributions.length > 0
        ? {
            value: attributions,
            // "where signed" matters: the 8-K rung's item codes carry no
            // direction, which is why those clauses always read "after". A flat
            // "direction-checked" would overstate what the archived note did.
            source: "Finnhub + Yahoo + SEC EDGAR (dated; direction-checked where signed)",
            asOf,
          }
        : null,
  };

  // The registry check runs last, so it sees everything that did report. It is
  // the only thing that catches a connector which stopped being CALLED — no
  // per-call error handler can see an absence of calls.
  health.push(...missingFromRegistry(health));

  return { facts, health };
}

/**
 * Attach the previous session's gamma figures, for the overnight delta.
 *
 * This is the only positioning FLOW read these sources allow. Open interest is a
 * snapshot, so the level says where the book sits; only the change says where it
 * moved, and the notes table has been storing the snapshots all along.
 *
 * Every guard here exists to stop a comparison that is not one:
 *
 *  - **Same symbol.** An SPX-quoted pin and an SPY-quoted pin are not the same
 *    number, and the fallback symbol is a real code path.
 *  - **Both sides carry `dealerGammaSign`.** A note from before the sign fix
 *    states the opposite stance, so "the book flipped" would fire on the
 *    deploy rather than on the market.
 *  - **Equal `horizonDays`.** Measured on 2026-08-13, the same book reads +0.53B
 *    over three expirations and +0.82B over 45 days. Comparing across the
 *    horizon change would report a 55% move that never happened.
 *  - **Within four sessions.** Reuses `fetchPriorSessionDate`'s rule: if a note
 *    failed to ship, the latest row can be several sessions old, and "overnight"
 *    would be a week.
 *
 * Note the duplication this creates: day N stores a copy of day N−1's figures,
 * so regenerating N−1 afterwards leaves N's snapshot stale. Accepted — the push
 * is composed at assemble time and needs the delta then — and recorded rather
 * than left to be discovered.
 */
async function attachPriorPin(gexPin: Fact<GexPinData> | null, marketDate: string): Promise<void> {
  const today = gexPin?.value;
  if (!today || today.dealerGammaSign == null) return;

  try {
    const rows = await db
      .select({ date: dailyNotes.date, facts: dailyNotes.facts })
      .from(dailyNotes)
      .where(lt(dailyNotes.date, marketDate))
      .orderBy(desc(dailyNotes.date))
      .limit(1);
    const row = rows[0];
    if (!row) return;

    const gapDays = (Date.parse(`${marketDate}T00:00:00Z`) - Date.parse(`${row.date}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(gapDays) || gapDays > 4) return;

    const prior = (JSON.parse(row.facts) as StructuredFacts).gexPin?.value;
    if (
      !prior ||
      prior.symbol !== today.symbol ||
      prior.dealerGammaSign == null ||
      prior.horizonDays !== today.horizonDays
    ) {
      return;
    }

    today.prior = {
      date: row.date,
      pinStrike: prior.pinStrike,
      dealerGammaSign: prior.dealerGammaSign,
      zeroGamma: prior.zeroGamma ?? null,
    };
    logger.info(SRC, "Prior gamma snapshot attached", {
      priorDate: row.date,
      pinMoved: prior.pinStrike !== today.pinStrike,
      stanceFlipped: prior.dealerGammaSign !== today.dealerGammaSign,
    });
  } catch (error) {
    // Additive: the section reads fine without it (§1a).
    logger.warn(SRC, "Prior gamma snapshot unavailable", { error });
  }
}

/**
 * Company names for the tickers the note may mention — the §1b alias list.
 *
 * Only the names actually in play are carried: the map is persisted with the
 * facts, and shipping all 503 would bloat every stored note to police prose
 * that can never mention them. `name` is nullable in the constituent table, and
 * a missing one simply means that ticker is policed by symbol alone.
 */
function buildCompanyNames(constituents: ConstituentQuote[], tickers: string[]): Record<string, string> | null {
  const wanted = new Set(tickers);
  const out: Record<string, string> = {};
  for (const c of constituents) {
    if (!wanted.has(c.ticker) || !c.name) continue;
    out[c.ticker] = c.name;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Score the whole index for relevance (§A). Purely a ranking input today — it
 * decides which names deserve the deeper treatment §B will add. Logged per run
 * so the coefficients can be reviewed against real output.
 */
function rankConstituents(
  constituents: ConstituentQuote[],
  sectors: SectorPoint[] | null,
  marketDate: string,
  priorSessionDate: string | null,
  closeMinute: number,
): RelevanceScore[] {
  if (constituents.length === 0 || !sectors) return [];
  const sectorPct = new Map(sectors.map((s) => [s.etf, s.changePct]));

  const inputs: RelevanceInput[] = [];
  for (const c of constituents) {
    const sp = sectorPct.get(c.sectorEtf);
    if (sp == null) continue;
    inputs.push({
      ticker: c.ticker,
      sectorEtf: c.sectorEtf,
      changePct: c.changePct,
      sectorPct: sp,
      price: c.price,
      volume: c.volume,
      avgVolume10d: c.avgVolume10d,
      sectorWeight: c.sectorWeight,
      reportedToday: isReactionDay(
        placeEarnings({ stamp: c.earningsStamp, marketDate, priorSessionDate, closeMinute }),
      ),
    });
  }
  return rankRelevance(inputs);
}

/**
 * After-hours moves for tickers the note ALREADY names (§G) — an annotation,
 * never a reason to introduce a name. The `asOf` is the last extended print's
 * own clock, not send time, so the rendered claim stays true at edit time.
 */
function postMarketFact(
  byTicker: Map<string, { changePct: number; asOfMs: number }>,
  divergence: DivergenceSector[],
  spotlight: SpotlightBlock[],
  contribution: ContributionData | null,
): Fact<PostMarketMove[]> | null {
  if (byTicker.size === 0) return null;

  const named = new Set<string>();
  for (const d of divergence) for (const n of d.names) named.add(n.ticker);
  for (const s of spotlight) {
    for (const n of [...s.leaders, ...s.laggards]) named.add(n.ticker);
    if (s.proxy) named.add(s.proxy.ticker);
  }
  // The index's top contributors are named on the web note and in the fact
  // sheet, and a mega-cap reporting after the close is the likeliest §G case of
  // all — omitting them left the flagship scenario unannotated.
  for (const t of contribution?.topNames ?? []) named.add(t);

  const moves: PostMarketMove[] = [];
  let newest = 0;
  for (const ticker of Array.from(named)) {
    const pm = byTicker.get(ticker);
    if (!pm) continue;
    moves.push({ ticker, changePct: pm.changePct, asOfEt: etClock(pm.asOfMs) });
    newest = Math.max(newest, pm.asOfMs);
  }
  if (moves.length === 0) return null;

  return {
    value: moves,
    source: "Yahoo extended hours (no volume field; indicative)",
    asOf: new Date(newest).toISOString(),
  };
}

/**
 * The previous trading session's date. `daily_notes` only holds sessions that
 * passed the §7a gate, so it is the de-facto trading calendar; the weekday
 * fallback covers the very first run, before any note exists.
 */
async function fetchPriorSessionDate(marketDate: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ date: dailyNotes.date })
      .from(dailyNotes)
      .where(lt(dailyNotes.date, marketDate))
      .orderBy(desc(dailyNotes.date))
      .limit(1);
    const found = rows[0]?.date;
    // Reject a row that is too far behind. If a prior note failed to ship, the
    // latest row can be several sessions old, and a name stamped after THAT
    // day's close would then classify as "today's reaction" — a false earnings
    // attribution for a reaction that already happened. Returning null just
    // stops the after-close row firing: omission, not fabrication (§1a).
    if (found) {
      const gapDays = (Date.parse(`${marketDate}T00:00:00Z`) - Date.parse(`${found}T00:00:00Z`)) / 86_400_000;
      if (Number.isFinite(gapDays) && gapDays <= 4) return found;
      logger.warn(SRC, "Prior note too old to serve as the prior session", { found, marketDate });
      return null;
    }
  } catch (error) {
    logger.warn(SRC, "Prior session lookup failed; falling back to previous weekday", { error });
  }
  const d = new Date(`${marketDate}T12:00:00Z`);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Minutes-since-ET-midnight of today's actual close.
 *
 * Take it from a tradeable ETF, NEVER from `^GSPC`. The index keeps printing
 * settlement values for roughly fifty minutes after the bell — it stamped
 * 16:50 ET on a normal session — while SPY and the sector funds stamp the true
 * 16:00. Using the index pushed the boundary past every after-close earnings
 * placeholder (stamped exactly 16:00), so those reports classified as
 * mid-session and got no attribution at all. An ETF also moves correctly to
 * 13:00 on a half-day, which is why this is derived rather than hardcoded.
 */
function closeMinuteFor(map: Map<string, QuoteLike>): number {
  for (const { etf } of SECTOR_ETFS) {
    const ms = toMs(map.get(etf)?.regularMarketTime);
    if (Number.isFinite(ms) && ms > 0) return etMinutes(ms);
  }
  return 16 * 60;
}

/** Minutes-since-ET-midnight, guarded. */
/** "6:14pm" in ET — the clock a post-market claim is stated as of. */
function etClock(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(ms))
    .replace(/\s/g, "")
    .toLowerCase();
}
