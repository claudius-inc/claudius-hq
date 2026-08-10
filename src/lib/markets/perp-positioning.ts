/**
 * Perp-native positioning signals — open interest, funding, taker aggression.
 *
 * WHY THIS EXISTS
 * ---------------
 * Everything else in this screen reads price structure off candles. MCD, the
 * moving averages, the swing extremes, the Wyckoff bars — all of it is derived
 * from OHLCV, so no amount of adding factors makes it see anything genuinely
 * new. The measured consequence is that the five MCD factors are highly
 * redundant with one another: `support` and `vsa` each fire on the majority of
 * bars in BOTH directions, and a high convergence count turns out to select
 * quiet names (score 5 averages 0.68x the category's typical 1-day move).
 *
 * Positioning data is not derivable from candles. Open interest says how many
 * contracts are actually open, funding says which side is paying to hold, and
 * taker ratio says who is crossing the spread. This is the information a
 * perpetual venue has that a chart does not, and none of it was being used.
 *
 * It is available for the tradfi book too — NVDAUSDT returns open interest the
 * same as BTCUSDT does — so it covers the whole universe, not just crypto.
 *
 * WHAT IS AND IS NOT CLAIMED
 * --------------------------
 * These are DESCRIPTIVE readings for a human to judge, not a validated signal.
 * `regime` in particular is the standard open-interest reading (rising OI into
 * rising price means new longs are being opened, rising OI into falling price
 * means new shorts) — it is a widely used framing, not something measured here.
 * Nothing in this module is ranked on until it has been tested.
 */
import { logger } from "@/lib/logger";

const BINANCE_DATA = "https://fapi.binance.com/futures/data";
const BINANCE_FAPI = "https://fapi.binance.com/fapi/v1";

/**
 * How a name's open interest is changing relative to its price.
 *
 * The four-quadrant reading traders actually use:
 *   newLongs     — OI up,   price up    → fresh money going long
 *   newShorts    — OI up,   price down  → fresh money going short
 *   shortCover   — OI down, price up    → shorts closing, not buyers arriving
 *   longUnwind   — OI down, price down  → longs closing, not sellers arriving
 *
 * The distinction matters for exactly the reason this screen exists: a rally on
 * falling open interest is people closing, and it tends to run out; a rally on
 * rising open interest has new commitment behind it.
 */
export type OiRegime = "newLongs" | "newShorts" | "shortCover" | "longUnwind" | "flat";

export interface Positioning {
  symbol: string;
  /** Percent change in open interest over the lookback. */
  oiChangePct: number | null;
  /** Latest notional open interest, quote currency. */
  oiValue: number | null;
  regime: OiRegime;
  /** Latest funding rate in basis points per settlement. */
  fundingBps: number | null;
  /** Percentile of the latest funding within this symbol's own history, 0-100.
   *  Absolute funding is not comparable across names — tradfi perps run 3-12x
   *  crypto funding — so crowding is measured against the name's own norm. */
  fundingPctl: number | null;
  /** Taker buy volume / sell volume, latest period. Above 1 = buyers crossing. */
  takerRatio: number | null;
  /** Latest taker ratio relative to its own trailing mean. */
  takerSkew: number | null;
}

interface OiRow { sumOpenInterest: string; sumOpenInterestValue: string; timestamp: number }
interface TakerRow { buySellRatio: string; timestamp: number }
interface FundingRow { fundingRate: string; fundingTime: number }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const pctlOf = (values: number[], v: number): number => {
  if (!values.length) return 50;
  const below = values.filter((x) => x <= v).length;
  return Math.round((100 * below) / values.length);
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Fetches positioning for one symbol.
 *
 * Every request is independently optional: a missing endpoint yields a null
 * field rather than dropping the name. Positioning is context added to a pick
 * that already qualified on price structure, so an outage here must not be able
 * to remove names from the report.
 */
export async function fetchPositioning(
  symbol: string,
  period: "4h" | "1h" | "1d" = "4h",
  lookback = 6,
): Promise<Positioning> {
  const out: Positioning = {
    symbol,
    oiChangePct: null,
    oiValue: null,
    regime: "flat",
    fundingBps: null,
    fundingPctl: null,
    takerRatio: null,
    takerSkew: null,
  };

  const [oi, taker, funding] = await Promise.all([
    getJson<OiRow[]>(`${BINANCE_DATA}/openInterestHist?symbol=${symbol}&period=${period}&limit=${lookback + 1}`),
    getJson<TakerRow[]>(`${BINANCE_DATA}/takerlongshortRatio?symbol=${symbol}&period=${period}&limit=30`),
    getJson<FundingRow[]>(`${BINANCE_FAPI}/fundingRate?symbol=${symbol}&limit=200`),
  ]);

  if (oi && oi.length >= 2) {
    const first = Number(oi[0].sumOpenInterest);
    const last = Number(oi[oi.length - 1].sumOpenInterest);
    out.oiValue = Number(oi[oi.length - 1].sumOpenInterestValue);
    if (Number.isFinite(first) && first > 0 && Number.isFinite(last)) {
      out.oiChangePct = (100 * (last - first)) / first;
    }
  }

  if (taker && taker.length) {
    const ratios = taker.map((t) => Number(t.buySellRatio)).filter(Number.isFinite);
    if (ratios.length) {
      out.takerRatio = ratios[ratios.length - 1];
      const m = mean(ratios);
      out.takerSkew = m ? out.takerRatio / m - 1 : null;
    }
  }

  if (funding && funding.length) {
    const rates = funding.map((f) => Number(f.fundingRate)).filter(Number.isFinite);
    if (rates.length) {
      const latest = rates[rates.length - 1];
      out.fundingBps = latest * 10_000;
      out.fundingPctl = pctlOf(rates, latest);
    }
  }

  return out;
}

/** Classifies the OI/price quadrant. `priceChangePct` is over the same window. */
export function classifyRegime(
  oiChangePct: number | null,
  priceChangePct: number | null,
  oiThreshold = 1,
  priceThreshold = 0.5,
): OiRegime {
  if (oiChangePct === null || priceChangePct === null) return "flat";
  const oiUp = oiChangePct > oiThreshold;
  const oiDown = oiChangePct < -oiThreshold;
  const pxUp = priceChangePct > priceThreshold;
  const pxDown = priceChangePct < -priceThreshold;

  if (oiUp && pxUp) return "newLongs";
  if (oiUp && pxDown) return "newShorts";
  if (oiDown && pxUp) return "shortCover";
  if (oiDown && pxDown) return "longUnwind";
  return "flat";
}

/**
 * Fetches positioning for many symbols with bounded concurrency.
 *
 * Three requests per symbol, so this is deliberately called on the QUALIFYING
 * candidates only (~136) and not the full 678-name universe — 2,000 requests
 * against Binance's IP budget would earn a ban for data that only decorates
 * names which already passed the screen.
 */
export async function fetchPositioningForAll(
  symbols: string[],
  concurrency = 6,
): Promise<Map<string, Positioning>> {
  const out = new Map<string, Positioning>();
  let cursor = 0;
  let failures = 0;

  const worker = async () => {
    while (cursor < symbols.length) {
      const s = symbols[cursor++];
      try {
        out.set(s, await fetchPositioning(s));
      } catch (err) {
        failures++;
        logger.warn("perp-positioning", "Positioning fetch failed", { symbol: s, error: err });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, symbols.length) }, worker));
  logger.info("perp-positioning", "Positioning fetch complete", {
    requested: symbols.length,
    fetched: out.size,
    failures,
  });
  return out;
}

/** Short human-readable label for the report. */
export const REGIME_LABEL: Record<OiRegime, string> = {
  newLongs: "new longs",
  newShorts: "new shorts",
  shortCover: "short cover",
  longUnwind: "long unwind",
  flat: "flat OI",
};
