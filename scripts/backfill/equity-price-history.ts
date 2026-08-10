/**
 * Backfills daily history for the tradfi perps' underlyings.
 *
 * Run with:
 *   npx tsx scripts/backfill/equity-price-history.ts
 *   npx tsx scripts/backfill/equity-price-history.ts --verify-only
 *   npx tsx scripts/backfill/equity-price-history.ts --symbol NVDAUSDT
 *
 * Two jobs in one pass:
 *
 *   1. FETCH — up to 10 years of daily bars per mapped underlying, stored in
 *      `equity_prices_daily`. Re-runnable: bars upsert on (ticker, date), so a
 *      second run refreshes adjusted closes (which every dividend rewrites)
 *      without duplicating anything.
 *
 *   2. VERIFY — check each mapping's Yahoo price against Binance's own
 *      indexPrice for that contract. This is the gate that catches a mapping
 *      pointing at the WRONG INSTRUMENT, which is a real and silent failure:
 *      `ALL` resolves to The Allstate Corporation with a plausible price while
 *      the contract is an altcoin index, and nothing anywhere would throw. A
 *      mapping that fails the gate is written back as `rejected` so it stops
 *      being used.
 *
 * Safe to run daily. The verification half is cheap and should be.
 */
// FIRST import, deliberately. `@/db` builds its libsql client at module load
// and throws without TURSO_DATABASE_URL; side-effect import order is preserved,
// so this populates the environment before that module is evaluated.
import "dotenv/config";
import {
  UNDERLYING_MAP,
  FETCHABLE,
  MAX_PRICE_DEVIATION_PCT,
  priceDeviationPct,
  type UnderlyingMapping,
} from "@/lib/markets/perp-underlying";
import {
  fetchEquityHistory,
  storeEquityHistory,
  DAILY_TREND_WARMUP,
} from "@/lib/markets/equity-history";
import { rawClient } from "@/db";
import { logger } from "@/lib/logger";

const VERIFY_ONLY = process.argv.includes("--verify-only");
const ONLY_SYMBOL = (() => {
  const i = process.argv.indexOf("--symbol");
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** Binance index prices for every tradfi contract, in one request. */
async function fetchIndexPrices(): Promise<Map<string, number>> {
  const res = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex", {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`premiumIndex HTTP ${res.status}`);
  const rows = (await res.json()) as { symbol: string; indexPrice: string }[];
  return new Map(rows.map((r) => [r.symbol, Number(r.indexPrice)]));
}

/** Latest Yahoo price for a ticker, for the verification gate only. */
async function fetchYahooSpot(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      chart: { result?: { meta: { regularMarketPrice?: number } }[] };
    };
    return j.chart.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

async function storedBarCount(ticker: string): Promise<number> {
  const r = await rawClient.execute({
    sql: "SELECT COUNT(*) AS n FROM equity_prices_daily WHERE ticker = ?",
    args: [ticker] as never[],
  });
  return Number(r.rows[0]?.n ?? 0);
}

async function upsertMapping(
  m: UnderlyingMapping,
  status: string,
  devPct: number | null,
  bars: number | null,
): Promise<void> {
  await rawClient.execute({
    sql: `INSERT INTO perp_underlying_map
            (venue, symbol, base, yahoo_ticker, fx_scale, status, price_dev_pct,
             bars_available, verified_at, note)
          VALUES (?,?,?,?,?,?,?,?, datetime('now'), ?)
          ON CONFLICT(venue, symbol) DO UPDATE SET
            base=excluded.base, yahoo_ticker=excluded.yahoo_ticker,
            fx_scale=excluded.fx_scale, status=excluded.status,
            price_dev_pct=excluded.price_dev_pct,
            bars_available=excluded.bars_available,
            verified_at=excluded.verified_at, note=excluded.note`,
    args: [
      "binance", m.symbol, m.base, m.yahoo, m.fxScale, status, devPct, bars, m.note ?? null,
    ] as never[],
  });
}

async function main() {
  const indexPrices = await fetchIndexPrices();
  console.log(`Binance index prices for ${indexPrices.size} contracts\n`);

  const targets = ONLY_SYMBOL
    ? FETCHABLE.filter((m) => m.symbol === ONLY_SYMBOL)
    : FETCHABLE;

  // ---- fetch ----
  let fetched = 0;
  let failed = 0;
  if (!VERIFY_ONLY) {
    console.log(`Fetching 10y daily history for ${targets.length} underlyings...`);
    for (const m of targets) {
      if (!m.yahoo) continue;
      try {
        const series = await fetchEquityHistory(m.yahoo);
        if (!series || series.bars.length === 0) {
          failed++;
          console.log(`  MISS  ${m.base.padEnd(9)} ${m.yahoo}`);
          continue;
        }
        const n = await storeEquityHistory(series);
        fetched++;
        if (fetched % 25 === 0) console.log(`  ...${fetched}/${targets.length}`);
        if (n < DAILY_TREND_WARMUP) {
          console.log(`  SHORT ${m.base.padEnd(9)} ${m.yahoo} — ${n} bars (<${DAILY_TREND_WARMUP})`);
        }
      } catch (err) {
        failed++;
        logger.warn("equity-backfill", "Fetch failed", { base: m.base, ticker: m.yahoo, error: err });
      }
    }
    console.log(`\nFetched ${fetched}, failed ${failed}\n`);
  }

  // ---- verify + record every mapping, including the unmapped ones ----
  console.log("Verifying mappings against Binance indexPrice...");
  let verified = 0;
  let demoted = 0;
  let unchecked = 0;

  for (const m of UNDERLYING_MAP) {
    if (m.status !== "verified" || !m.yahoo) {
      await upsertMapping(m, m.status, null, null);
      continue;
    }

    const idx = indexPrices.get(m.symbol);
    const spot = await fetchYahooSpot(m.yahoo);
    const bars = await storedBarCount(m.yahoo);

    if (!idx || spot === null) {
      // Cannot check right now — record it, but do not silently promote it.
      unchecked++;
      await upsertMapping(m, "verified", null, bars);
      continue;
    }

    const dev = priceDeviationPct(spot, idx, m.fxScale);
    if (dev > MAX_PRICE_DEVIATION_PCT) {
      demoted++;
      console.log(
        `  DEMOTED ${m.base.padEnd(9)} ${String(m.yahoo).padEnd(12)} ` +
          `dev ${dev.toFixed(2)}% (yahoo ${spot} x ${m.fxScale} vs index ${idx})`,
      );
      await upsertMapping(m, "rejected", dev, bars);
    } else {
      verified++;
      await upsertMapping(m, "verified", dev, bars);
    }
  }

  console.log(
    `\nVerified ${verified}, demoted ${demoted}, unchecked ${unchecked}, ` +
      `total mappings ${UNDERLYING_MAP.length}`,
  );

  const ready = await rawClient.execute({
    sql: `SELECT COUNT(*) AS n FROM perp_underlying_map
          WHERE status = 'verified' AND bars_available >= ?`,
    args: [DAILY_TREND_WARMUP] as never[],
  });
  console.log(`Contracts with a usable daily trend: ${ready.rows[0]?.n ?? 0}`);
}

main().catch((err) => {
  logger.error("equity-backfill", "Backfill crashed", { error: err });
  process.exit(1);
});
