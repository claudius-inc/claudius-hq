/**
 * Perp venue adapters — the tradable universe for the convergence screen.
 *
 * WHY AN INTERFACE RATHER THAN A BINANCE MODULE
 * ---------------------------------------------
 * Binance is the only venue wired up today, but Hyperliquid (HIP-3) lists the
 * same kind of equity and pre-IPO perps and is the stated next step. Everything
 * downstream — the MCD scorer, the screen, the report — consumes `PerpSymbol`
 * and `PerpBar` and never sees a venue-specific field, so adding Hyperliquid is
 * a new `PerpVenue` implementation and a line in `VENUES`, not a refactor.
 *
 * WHAT BINANCE ACTUALLY LISTS
 * ---------------------------
 * `contractType` splits the book in two, and this is easy to get wrong:
 *   PERPETUAL          — 567 crypto perps (underlyingType COIN)
 *   TRADIFI_PERPETUAL  — 152 equity / commodity / pre-IPO perps
 * Filtering on `contractType === "PERPETUAL"` silently drops the ENTIRE tradfi
 * book — NVDA, TSLA, COIN, RKLB, SPCX, OPENAI, ANTHROPIC. Both types are
 * required. `status` matters too: the payload carries 127 SETTLING contracts
 * (expired quarterlies and delisted names) alongside the live ones.
 */
import { logger } from "@/lib/logger";

export type PerpCategory = "crypto" | "equity" | "premarket" | "commodity" | "index";

export interface PerpSymbol {
  /** Venue key, e.g. "binance". */
  venue: string;
  /** Venue-native symbol used for data requests, e.g. "SPCXUSDT". */
  symbol: string;
  /** Display base, e.g. "SPCX". */
  base: string;
  quote: string;
  category: PerpCategory;
}

/** One OHLCV bar. `t` is the bar OPEN time in epoch ms. */
export interface PerpBar {
  t: number;
  /**
   * Bar CLOSE time in epoch ms.
   *
   * Carried separately because `t` is the open. Reporting `t` as the moment a
   * score was computed understates it by a full interval — a 00:10 UTC run
   * scoring the 20:00-00:00 bar would announce "as of 20:00Z" and read four
   * hours stale — and any join on that timestamp is off by one bar.
   */
  tClose: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Base-asset volume — in COINS, not dollars. */
  v: number;
  /**
   * Quote-asset volume, i.e. traded value in USDT.
   *
   * The liquidity floor must use this and not `v`: base volume is denominated
   * in the coin, so a $6 name and a $100k name with identical base volume differ
   * by four orders of magnitude in tradability.
   */
  q: number;
}

export type PerpInterval = "1h" | "4h" | "1d";

export interface PerpVenue {
  name: string;
  listSymbols(): Promise<PerpSymbol[]>;
  /** Bars oldest-first, ending at the most recent CLOSED bar. */
  fetchBars(symbol: string, interval: PerpInterval, limit: number): Promise<PerpBar[]>;
}

/**
 * Binance base URL, overridable so the fetch can be routed through a relay.
 *
 * Binance answers HTTP 451 to restricted locations, and that is enforced on
 * datacenter IP RANGES, not merely on US geography — the block has been
 * reported on Google Cloud from asia-northeast1 too, so "deploy to a non-US
 * region" is not a reliable fix on its own. Since every venue call in this file
 * goes through one constant, pointing that constant at a relay hosted on a
 * served IP range is enough to run the whole pipeline from anywhere.
 *
 * The relay must expose the same paths (`/fapi/v1/...`) and pass the response
 * through unchanged. Unset means talk to Binance directly, which is correct
 * when running somewhere already permitted.
 */
export const BINANCE_FAPI = process.env.BINANCE_API_BASE ?? "https://fapi.binance.com";

/**
 * Binance's `underlyingType` is authoritative here — it is the exchange's own
 * classification, so it does not drift when they list a new sector.
 */
const CATEGORY_BY_UNDERLYING: Record<string, PerpCategory> = {
  COIN: "crypto",
  INDEX: "index",
  EQUITY: "equity",
  KR_EQUITY: "equity",
  HK_EQUITY: "equity",
  COMMODITY: "commodity",
  PREMARKET: "premarket",
};

/**
 * Quote-asset preference for de-duplication.
 *
 * A base can list against several quotes — SPCX trades as both SPCXUSDT and
 * SPCXUSD1. They are the same underlying exposure, so screening both would put
 * one name in the report twice and double-count it in the cross-sectional
 * percentiles. Lowest rank wins.
 */
const QUOTE_RANK: Record<string, number> = { USDT: 0, USDC: 1, USD1: 2 };

interface BinanceSymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  contractType: string;
  underlyingType: string;
}

/**
 * A response the venue will never satisfy — a bad symbol, a delisted contract.
 *
 * Distinguished from transient failures so it is not retried. The previous
 * version threw a plain Error from inside the `try`, where its own `catch`
 * immediately caught it and turned every permanent 400 into three attempts and
 * six seconds of sleeps.
 */
class PermanentHttpError extends Error {}

/** Per-request ceiling. Without it a hung socket parks a `fetchBarsForAll`
 *  worker indefinitely, and that function has no deadline of its own. */
const REQUEST_TIMEOUT_MS = 20_000;

async function getJson<T>(url: string, what: string, retries = 3): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return (await res.json()) as T;

      // 418/429 are Binance's rate-limit responses and carry Retry-After.
      if (res.status === 429 || res.status === 418) {
        const wait = Number(res.headers.get("retry-after") ?? 0) * 1000 || 2000 * (attempt + 1);
        await sleep(wait);
        continue;
      }
      throw new PermanentHttpError(
        `${what}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
    } catch (err) {
      if (err instanceof PermanentHttpError) throw err;
      lastErr = err;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`${what}: retries exhausted (${String(lastErr)})`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const binanceVenue: PerpVenue = {
  name: "binance",

  async listSymbols(): Promise<PerpSymbol[]> {
    const data = await getJson<{ symbols: BinanceSymbolInfo[] }>(
      `${BINANCE_FAPI}/fapi/v1/exchangeInfo`,
      "binance exchangeInfo",
    );

    const live = data.symbols.filter(
      (s) =>
        s.status === "TRADING" &&
        (s.contractType === "PERPETUAL" || s.contractType === "TRADIFI_PERPETUAL"),
    );

    // Keep one row per base, preferring the USDT quote.
    const best = new Map<string, BinanceSymbolInfo>();
    for (const s of live) {
      const prev = best.get(s.baseAsset);
      const rank = QUOTE_RANK[s.quoteAsset] ?? 99;
      const prevRank = prev ? (QUOTE_RANK[prev.quoteAsset] ?? 99) : 100;
      if (rank < prevRank) best.set(s.baseAsset, s);
    }

    const out: PerpSymbol[] = [];
    for (const s of Array.from(best.values())) {
      const category = CATEGORY_BY_UNDERLYING[s.underlyingType];
      // An unmapped underlyingType means Binance added a class we have not seen.
      // Skipping silently would shrink the universe invisibly, so it is logged.
      if (!category) {
        logger.warn("perp-venues", "Unmapped Binance underlyingType; symbol skipped", {
          symbol: s.symbol,
          underlyingType: s.underlyingType,
        });
        continue;
      }
      out.push({
        venue: "binance",
        symbol: s.symbol,
        base: s.baseAsset,
        quote: s.quoteAsset,
        category,
      });
    }
    return out;
  },

  async fetchBars(symbol: string, interval: PerpInterval, limit: number): Promise<PerpBar[]> {
    const raw = await getJson<unknown[][]>(
      `${BINANCE_FAPI}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `binance klines ${symbol}`,
    );

    const bars = raw.map((k) => ({
      t: Number(k[0]),
      tClose: Number(k[6]), // closeTime

      o: Number(k[1]),
      h: Number(k[2]),
      l: Number(k[3]),
      c: Number(k[4]),
      v: Number(k[5]),
      q: Number(k[7]), // quoteAssetVolume
    }));

    // The final kline is the bar currently forming: its close is the live price
    // and its high/low/volume are incomplete. Scoring it would make the screen
    // depend on the minute it ran, and would make a backtest that replays
    // closed bars disagree with live output. Drop it.
    return bars.slice(0, -1).filter((b) => Number.isFinite(b.c) && b.c > 0);
  },
};

export const VENUES: Record<string, PerpVenue> = { binance: binanceVenue };

const INTERVAL_MS_MAP: Record<PerpInterval, number> = {
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/**
 * Fetches deep history by paging `startTime` forward.
 *
 * 1500 is Binance's PER-REQUEST cap, not a limit on available history — the
 * backtest was silently capped at ~83 days of 4h bars because it issued one
 * request per symbol, which is why its walk-forward blocks all landed inside a
 * single month. Paging lifts that.
 *
 * `limit` is 1000 rather than 1500 deliberately: Binance weights klines at 5
 * for limit<=1000 and 10 above it, so three 1000-bar pages cost 15 against a
 * 2400/min budget where two 1500-bar pages cost 20 for fewer bars.
 */
export async function fetchBarsDeep(
  venue: PerpVenue,
  symbol: string,
  interval: PerpInterval,
  targetBars: number,
): Promise<PerpBar[]> {
  const step = INTERVAL_MS_MAP[interval];
  const pageSize = 1000;
  let startTime = Date.now() - targetBars * step;

  const seen = new Map<number, PerpBar>();
  for (let page = 0; page < Math.ceil(targetBars / pageSize) + 1; page++) {
    const raw = await getJson<unknown[][]>(
      `${BINANCE_FAPI}/fapi/v1/klines?symbol=${symbol}&interval=${interval}` +
        `&startTime=${startTime}&limit=${pageSize}`,
      `binance klines ${symbol} page ${page}`,
    );
    if (!raw.length) break;

    for (const k of raw) {
      const t = Number(k[0]);
      seen.set(t, {
        t,
        tClose: Number(k[6]),
        o: Number(k[1]),
        h: Number(k[2]),
        l: Number(k[3]),
        c: Number(k[4]),
        v: Number(k[5]),
        q: Number(k[7]),
      });
    }

    const lastOpen = Number(raw[raw.length - 1][0]);
    // A short page means the series is exhausted; equal startTime means no
    // progress, which would otherwise loop forever.
    if (raw.length < pageSize || lastOpen + step <= startTime) break;
    startTime = lastOpen + step;
  }

  const bars = Array.from(seen.values()).sort((a, b) => a.t - b.t);
  // Same rule as fetchBars: the final kline is still forming.
  return bars.slice(0, -1).filter((b) => Number.isFinite(b.c) && b.c > 0);
}

/**
 * Fetches bars for many symbols with bounded concurrency.
 *
 * Binance weights a klines call by `limit`: <100 costs 1, 100-500 costs 2,
 * 501-1000 costs 5, above that 10, against a 2400/min budget. ~700 symbols at
 * limit<=500 is ~1400 weight, which fits inside one minute — but only if the
 * requests are paced. Unbounded Promise.all would fire 700 at once and earn a
 * 418 ban, so concurrency is capped.
 *
 * A symbol that fails after retries is dropped with a warning rather than
 * failing the run: one delisted-mid-run contract should not cost the report.
 */
export async function fetchBarsForAll(
  venue: PerpVenue,
  symbols: PerpSymbol[],
  interval: PerpInterval,
  limit: number,
  concurrency = 8,
): Promise<Map<string, PerpBar[]>> {
  const out = new Map<string, PerpBar[]>();
  let cursor = 0;
  let failures = 0;

  const worker = async () => {
    while (cursor < symbols.length) {
      const s = symbols[cursor++];
      try {
        const bars = await venue.fetchBars(s.symbol, interval, limit);
        if (bars.length) out.set(s.symbol, bars);
      } catch (err) {
        failures++;
        logger.warn("perp-venues", "Bar fetch failed; symbol dropped", {
          symbol: s.symbol,
          error: err,
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, symbols.length) }, worker));

  logger.info("perp-venues", "Bar fetch complete", {
    venue: venue.name,
    interval,
    requested: symbols.length,
    fetched: out.size,
    failures,
  });
  return out;
}
