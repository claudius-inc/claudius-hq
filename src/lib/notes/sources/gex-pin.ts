/**
 * Dealer gamma for THE BOOK — see docs/daily-note-spec.md §3/§4.8.
 *
 * `markets/gex.ts` is the pure calculator and fetches nothing; this module is
 * the fetch. Four things it gets right that a naive version does not, each
 * measured rather than assumed:
 *
 *  1. **The horizon is dated, not counted.** SPY expires daily now, so the old
 *     "nearest three expirations" was a three-calendar-day book. On 2026-08-13
 *     it excluded the 21 August monthly, which alone carried 3.5M contracts —
 *     2.6× the entire window — and net gamma measured +0.53B against +0.82B on a
 *     real horizon. A 55% error in the headline quantity.
 *
 *     45 days, fixed. NOT anchored to the monthly expiration: an OPEX-anchored
 *     window is ~31 days wide the day after expiry and ~1 day wide the day
 *     before, so net gamma would move with the window rather than with the book,
 *     and the overnight delta would read that sawtooth as flow.
 *
 *  2. **Each expiry is priced at its own T.** Gamma scales ~1/sqrt(T).
 *
 *  3. **No invented volatility.** A missing or absurd implied vol is DROPPED,
 *     the same way zero open interest is. The previous `|| 0.3` fallback
 *     fabricated a 30% vol, which is precisely what §1a forbids. Measured on the
 *     live chain the fallback never fired — but the guard has to be in place
 *     before the horizon widens, because the long-dated chains are where Yahoo's
 *     volatility hygiene is worst.
 *
 *  4. **Post-close open interest is start-of-day.** The reading is directional.
 *     Report the pin, the sign, and the zero-gamma level; never a false
 *     precision on the magnitude.
 */
import YahooFinance from "yahoo-finance2";
import { calculateGex, zeroGammaLevel, type OptionLeg } from "@/lib/markets/gex";
import { logger } from "@/lib/logger";
import type { Fact, GexPinData } from "@/lib/notes/types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/gex-pin";

/**
 * Longest expiry aggregated, in days. Wide enough to always contain the next
 * monthly expiration — consecutive third Fridays are 28 or 35 days apart — with
 * margin, and measured to capture ~88% of the gamma inside 60 days.
 */
const HORIZON_DAYS = 45;

/**
 * How far either side of spot a strike may sit and still be eligible as the pin.
 * A far tail strike carries no hedging flow that matters today.
 */
const PIN_BAND = 0.1;

/** Implied volatilities outside this band are data defects, not quotes. */
const IV_MIN = 0.03;
const IV_MAX = 1.5;

/**
 * Minimum coverage before a pin is a claim about the book rather than about
 * whatever survived a bad fetch.
 *
 * Yahoo blanks open interest across the WHOLE chain for part of the night —
 * measured on 2026-08-13, every leg carried real open interest at 21:20 ET and
 * every leg read zero at 00:54 ET, on the default call as well as the dated
 * ones. A total blank is harmless: nothing survives and the section is omitted.
 * A PARTIAL one is the danger, because "the strike carrying the most gamma"
 * stays computable from two strikes and reads exactly like the real thing.
 *
 * The daily job runs at 18:20 ET, inside the window that measured healthy, so
 * this is a guard rather than a routine path. A healthy chain carries 100+
 * strikes inside the pin band; 20 is far below any real day and far above the
 * degenerate one.
 */
const MIN_PIN_BAND_STRIKES = 20;
const MIN_EXPIRIES = 2;

interface ChainOption {
  strike: number;
  openInterest?: number;
  impliedVolatility?: number;
}

/**
 * Dealer gamma for `symbol` (default SPY).
 *
 * It must be SPY. Yahoo publishes `^SPX` expirations, but every one of them
 * carries ZERO open interest, and open interest is the entire input to a gamma
 * sum — an index chain returns a confidently empty answer, not a better one.
 * Measured 2026-08-13: 52 `^SPX` expirations, 0 open interest; SPY's front
 * expiry alone carried 83,706 contracts of call open interest. The renderer
 * converts to index scale for display.
 */
export async function fetchGexPinFact(asOf: string, symbol = "SPY"): Promise<Fact<GexPinData> | null> {
  try {
    // The default call returns ONE chain (the front expiry) plus the list of all
    // expiration dates, so aggregating needs an explicit fetch per date.
    const head = await yahooFinance.options(symbol);
    const spot = head?.quote?.regularMarketPrice;
    if (!spot) return null;

    const now = Date.now();
    const dteOf = (d: Date) => Math.ceil((d.getTime() - now) / 86_400_000);
    // dte >= 1 drops the chain that expired at today's close — a post-close run
    // otherwise reads an expired 0DTE book. The chain expiring TOMORROW stays,
    // which is the one that becomes the next session's 0DTE.
    const dates = (head.expirationDates ?? []).filter((d) => {
      const dte = dteOf(d);
      return dte >= 1 && dte <= HORIZON_DAYS;
    });
    if (dates.length === 0) {
      logger.warn(SRC, "No expirations inside the horizon", { symbol, horizonDays: HORIZON_DAYS });
      return null;
    }

    const legs: OptionLeg[] = [];
    let contributing = 0;
    let droppedIv = 0;

    for (const exp of dates) {
      const daysToExpiry = Math.max(1, dteOf(exp));
      const chain =
        exp.getTime() === head.expirationDates?.[0]?.getTime() && head.options?.[0]
          ? head.options[0]
          : (await yahooFinance.options(symbol, { date: exp })).options?.[0];
      if (!chain) continue;

      const before = legs.length;
      const add = (o: ChainOption, type: "call" | "put") => {
        const oi = o.openInterest ?? 0;
        if (oi <= 0) return;
        const iv = o.impliedVolatility;
        // Dropped, never defaulted. A fabricated volatility is a fabricated
        // gamma, and gamma ~ 1/sigma — a stale 3% quote near the money would
        // carry ten times the weight of a real 30% one.
        if (iv == null || !Number.isFinite(iv) || iv < IV_MIN || iv > IV_MAX) {
          droppedIv++;
          return;
        }
        legs.push({ strike: o.strike, openInterest: oi, impliedVolatility: iv, type, daysToExpiry });
      };
      for (const c of chain.calls ?? []) add(c as ChainOption, "call");
      for (const p of chain.puts ?? []) add(p as ChainOption, "put");
      if (legs.length > before) contributing++;
    }

    if (legs.length === 0) {
      logger.warn(SRC, "No usable options in the horizon", { symbol, droppedIv });
      return null;
    }

    const gex = calculateGex(legs, spot);

    // The pin: the strike carrying the most gamma in absolute terms, near spot.
    // Its SIGN decides whether it reads as a magnet or an accelerant, so it is
    // carried out of here rather than recomputed from the net.
    const inBand = gex.byStrike.filter(
      (s) => s.strike >= spot * (1 - PIN_BAND) && s.strike <= spot * (1 + PIN_BAND),
    );
    if (inBand.length < MIN_PIN_BAND_STRIKES || contributing < MIN_EXPIRIES) {
      logger.warn(SRC, "Chain too thin to describe the book — omitting", {
        symbol,
        strikesInBand: inBand.length,
        expiriesContributing: contributing,
        legs: legs.length,
        droppedIv,
      });
      return null;
    }

    let pinStrike: number | null = null;
    let pinGex = 0;
    let pinAbs = -1;
    for (const s of inBand) {
      if (Math.abs(s.totalGex) > pinAbs) {
        pinAbs = Math.abs(s.totalGex);
        pinStrike = s.strike;
        pinGex = s.totalGex;
      }
    }
    if (pinStrike == null) return null;

    const zeroGamma = zeroGammaLevel(legs, spot);

    // Stability watch, not a computation. The zero-gamma level measured stable
    // across every band, volatility filter and horizon on one day — one day is
    // not a distribution, so the front-three subset is logged beside the full
    // book until there is enough history to call it settled. No extra fetch.
    logStability(legs, spot, dates.map(dteOf), { pinStrike, zeroGamma });

    return {
      value: {
        symbol,
        spot: Math.round(spot * 100) / 100,
        pinStrike,
        pinGex: Math.round(pinGex),
        // Positive = dealers long gamma, which dampens moves. This is an
        // assumption about who holds the other side, not a measurement.
        dealerGammaSign: gex.totalGex >= 0 ? 1 : -1,
        zeroGamma: zeroGamma != null ? Math.round(zeroGamma * 100) / 100 : null,
        horizonDays: HORIZON_DAYS,
        distancePct: Math.round(((pinStrike - spot) / spot) * 10000) / 100,
        expiriesUsed: contributing,
      },
      source: "Yahoo options (start-of-day OI; dealers assumed long calls, short puts)",
      asOf,
    };
  } catch (error) {
    logger.warn(SRC, "GEX pin unavailable", { symbol, error });
    return null;
  }
}

/** The same two figures on the old three-expiry window, for comparison only. */
function logStability(
  legs: OptionLeg[],
  spot: number,
  dtes: number[],
  full: { pinStrike: number; zeroGamma: number | null },
): void {
  const frontThree = Array.from(new Set(dtes)).sort((a, b) => a - b).slice(0, 3);
  const cutoff = frontThree[frontThree.length - 1];
  if (cutoff == null) return;
  const subset = legs.filter((l) => l.daysToExpiry <= cutoff);
  if (subset.length === 0) return;

  const g = calculateGex(subset, spot);
  let pin: number | null = null;
  let abs = -1;
  for (const s of g.byStrike) {
    if (s.strike < spot * (1 - PIN_BAND) || s.strike > spot * (1 + PIN_BAND)) continue;
    if (Math.abs(s.totalGex) > abs) {
      abs = Math.abs(s.totalGex);
      pin = s.strike;
    }
  }
  logger.info(SRC, "Gamma stability check", {
    horizonDays: HORIZON_DAYS,
    pin: full.pinStrike,
    zeroGamma: full.zeroGamma,
    frontThreePin: pin,
    frontThreeZeroGamma: zeroGammaLevel(subset, spot),
    pinAgrees: pin === full.pinStrike,
  });
}
