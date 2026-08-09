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
import { logger } from "@/lib/logger";
import { fetchBreadthData } from "@/lib/markets/breadth";
import { fetchRatesFact } from "@/lib/notes/sources/treasury";
import { computeDivergenceFacts } from "@/lib/notes/divergence";
import { fetchGexPinFact } from "@/lib/notes/sources/gex-pin";
import { fetchEconEvents } from "@/lib/notes/sources/econ-calendar";
import { loadEnabledSpotlights, buildSpotlightBlocks } from "@/lib/notes/spotlight";
import { etDate, etStamp } from "@/lib/notes/session";
import type {
  Fact,
  IndexPoint,
  CrossAssetPoint,
  SectorPoint,
  VixData,
  BreadthData,
  StructuredFacts,
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

const CROSS_ASSETS: { symbol: string; label: string }[] = [
  { symbol: "DX-Y.NYB", label: "DXY" },
  { symbol: "GC=F", label: "Gold" },
  { symbol: "CL=F", label: "Crude" },
  { symbol: "BTC-USD", label: "BTC" },
];

interface QuoteLike {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
}

const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Minutes since ET midnight for an instant. */
function etMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (h % 24) * 60 + m;
}

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
    pts.push({ etf, name, changePct: round(q.regularMarketChangePercent) });
  }
  // A partial board can't support a market-wide "top-2 / bottom-2" claim (§1a):
  // require the full 11 sectors or omit.
  if (pts.length !== SECTOR_ETFS.length) return null;
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

/** Assemble the full deterministic fact set for `marketDate` (YYYY-MM-DD, ET). */
export async function assembleFacts(marketDate: string, now = Date.now()): Promise<StructuredFacts> {
  const quoteSymbols = [...INDICES.map((i) => i.symbol), ...SECTOR_ETFS.map((s) => s.etf)];

  const [quoteMap, vix, crossAsset, rates, breadth] = await Promise.all([
    fetchBatchQuoteMap(quoteSymbols).catch((error) => {
      logger.error(SRC, "Batch quote failed", { error });
      return new Map<string, QuoteLike>();
    }),
    vixFact(marketDate, now),
    crossAssetFact(now),
    fetchRatesFact(marketDate),
    breadthFact(marketDate, now),
  ]);

  const indices = indicesFact(quoteMap, marketDate, now);
  const sectors = sectorsFact(quoteMap, marketDate, now);

  // Divergence + contribution need the sector benchmarks and the index move,
  // so they run after the batch quote resolves (§5, §8).
  const spChange = indices?.value.find((i) => i.symbol === "^GSPC")?.changePct ?? null;
  const { divergence, contribution, moversBySector } = await computeDivergenceFacts(
    sectors?.value ?? null,
    spChange,
  );
  const asOf = etStamp(marketDate, "16:00:00", now);

  // Slice-4 depth: gamma pin, next-session econ releases, spotlight blocks.
  // Each degrades to null independently (§1a) — the section is simply omitted.
  const nextDay = new Date(now + 86_400_000);
  const nextDate = etDate(nextDay.getTime());
  const [gexPin, econEvents, enabledSpotlights] = await Promise.all([
    fetchGexPinFact(asOf),
    // Window covers the next few calendar days so a Friday note reaches Monday.
    fetchEconEvents(nextDate, etDate(now + 4 * 86_400_000), asOf),
    loadEnabledSpotlights(),
  ]);

  const spotlightBlocks = await buildSpotlightBlocks({
    enabled: enabledSpotlights,
    sectors: sectors?.value ?? null,
    crossAsset: crossAsset?.value ?? null,
    divergence,
    movers: moversBySector,
  });

  return {
    date: marketDate,
    generatedAt: new Date(now).toISOString(),
    indices,
    rates,
    vix,
    crossAsset,
    sectors,
    breadth,
    divergence: divergence.length > 0 ? { value: divergence, source: "Yahoo + SPDR holdings", asOf } : null,
    contribution: contribution ? { value: contribution, source: "Yahoo + SPY float weights", asOf } : null,
    gexPin,
    econEvents,
    spotlight: spotlightBlocks.length > 0 ? { value: spotlightBlocks, source: "Yahoo + spotlight config", asOf } : null,
  };
}
