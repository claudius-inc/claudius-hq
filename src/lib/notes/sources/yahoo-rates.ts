/**
 * Provisional same-day yields from Yahoo — the stopgap when the Treasury par
 * curve has not published yet (see `treasury.ts`).
 *
 * The US Treasury daily CSV is the authoritative same-day source, but it posts
 * ~6pm ET and is sometimes late, so a note generated at 6:15pm can find no row
 * and omit the whole rates section (§1a: never print a stale prior day as
 * today's). This fills the gap: Yahoo's CBOE yield indices carry TODAY's 10Y
 * (^TNX) and 30Y (^TYX) intraday, so the note can show them provisionally until
 * the back-fill swaps in the authoritative Treasury curve.
 *
 * Deliberately PARTIAL. Yahoo has no reliable same-day 2Y yield — `2YY=F` is an
 * expired quarterly contract and `ZT=F` is a note price, not a yield — so the 2Y
 * and the 2s10s spread are left absent rather than fabricated (§1a). `provisional`
 * marks the fact so the renderers can label it and the back-fill can find it.
 */
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";
import { acquireYahooSlot } from "@/lib/scanner/yahoo-rate-limiter";
import { etDate, etOffset, toMs } from "@/lib/notes/session";
import type { Fact, RatesData } from "@/lib/notes/types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/yahoo-rates";

/** ^TNX and ^TYX quote the yield directly (e.g. 4.71 = 4.71%). */
interface YieldQuote {
  price: number;
  prevClose: number;
  /** ET date of the quote's last regular print. */
  date: string | null;
}

async function fetchYield(symbol: string): Promise<YieldQuote | null> {
  try {
    await acquireYahooSlot();
    const q = (await yahooFinance.quote(symbol)) as {
      regularMarketPrice?: number;
      regularMarketPreviousClose?: number;
      regularMarketTime?: Date | number | string;
    };
    const price = q?.regularMarketPrice;
    const prevClose = q?.regularMarketPreviousClose;
    if (price == null || !Number.isFinite(price) || prevClose == null || !Number.isFinite(prevClose)) {
      return null;
    }
    const ms = toMs(q.regularMarketTime);
    return { price, prevClose, date: Number.isFinite(ms) && ms > 0 ? etDate(ms) : null };
  } catch (error) {
    logger.warn(SRC, "Yahoo yield fetch failed", { symbol, error });
    return null;
  }
}

/**
 * A provisional 10Y/30Y rates fact for `marketDate`, or null when Yahoo has not
 * yet printed the target session either (so we never stamp yesterday's yield as
 * today's). Basis-point changes come from Yahoo's own previous close.
 */
export async function fetchYahooRatesFact(marketDate: string): Promise<Fact<RatesData> | null> {
  const [tnx, tyx] = await Promise.all([fetchYield("^TNX"), fetchYield("^TYX")]);
  if (!tnx || !tyx) {
    logger.warn(SRC, "Provisional yields unavailable — 10Y or 30Y did not resolve", { marketDate });
    return null;
  }

  // Both legs must be TODAY's print. A quote still on the prior session means
  // Yahoo has not updated for `marketDate`, and a provisional print of a stale
  // yield would be exactly the §1a failure the Treasury path avoids.
  if (tnx.date !== marketDate || tyx.date !== marketDate) {
    logger.warn(SRC, "Yahoo yields not yet on the market date — omitting provisional rates", {
      marketDate,
      tnxDate: tnx.date,
      tyxDate: tyx.date,
    });
    return null;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    value: {
      y10: round2(tnx.price),
      y30: round2(tyx.price),
      chg10Bp: Math.round((tnx.price - tnx.prevClose) * 100),
      chg30Bp: Math.round((tyx.price - tyx.prevClose) * 100),
      // 2Y and the 2s10s spread are intentionally absent — see the file header.
      provisional: true,
    },
    source: "Yahoo (provisional — awaiting Treasury)",
    asOf: `${marketDate}T16:00:00${etOffset(new Date(`${marketDate}T12:00:00Z`).getTime())}`,
  };
}
