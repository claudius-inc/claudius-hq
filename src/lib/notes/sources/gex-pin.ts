/**
 * Dealer gamma pin for THE BOOK — see docs/daily-note-spec.md §3/§4.8.
 *
 * The existing GEX code is split awkwardly for our purposes: `markets/gex.ts` is
 * a pure calculator that fetches nothing, and the only chain-fetch lives inside
 * the API route (which a tsx job can't reuse). This module is that fetch,
 * extracted, with three corrections the route doesn't make:
 *
 *  1. "Pin" is defined as the max-|GEX| strike — the strike with the most dealer
 *     gamma, i.e. where hedging flow is most likely to hold price. The route's
 *     `maxPainStrike` is actually just the highest-OI strike, which is not the
 *     same thing and is not max pain either.
 *  2. Several expirations are aggregated, not just the nearest. Run after the
 *     close, the front expiry can be a just-expired 0DTE chain.
 *  3. Post-close OI is start-of-day, so the reading is directional, not precise —
 *     we only report the pin and the sign of total GEX, never a false precision.
 */
import YahooFinance from "yahoo-finance2";
import { calculateGex } from "@/lib/markets/gex";
import { logger } from "@/lib/logger";
import type { Fact, GexPinData } from "@/lib/notes/types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/gex-pin";

/** How many expirations to aggregate. */
const EXPIRIES = 3;

interface ChainOption {
  strike: number;
  openInterest?: number;
  impliedVolatility?: number;
}

/**
 * Compute the gamma pin for `symbol` (default SPY — Yahoo's index-option
 * coverage for ^SPX is unreliable, so we read the ETF and report ETF-scale
 * levels rather than silently mixing scales).
 */
export async function fetchGexPinFact(asOf: string, symbol = "SPY"): Promise<Fact<GexPinData> | null> {
  try {
    // The default call returns ONE chain (the front expiry) plus the list of all
    // expiration dates — so aggregating requires an explicit fetch per date. It
    // also means a post-close run can otherwise see only a just-expired 0DTE
    // chain and produce nothing at all.
    const head = await yahooFinance.options(symbol);
    const spot = head?.quote?.regularMarketPrice;
    if (!spot) return null;

    const now = Date.now();
    const futureDates = (head.expirationDates ?? [])
      .filter((d) => Math.ceil((d.getTime() - now) / 86_400_000) >= 1)
      .slice(0, EXPIRIES);
    if (futureDates.length === 0) {
      logger.warn(SRC, "No future expirations available", { symbol });
      return null;
    }

    // Gamma scales ~1/sqrt(T), so each expiry MUST be priced at its own dte —
    // pricing a 1-DTE chain at a 30-day T understates its gamma several-fold and
    // would skew both the pin and the net-gamma sign toward the far expiry.
    const strikeTotals = new Map<number, number>();
    let netGex = 0;
    let contributing = 0;

    for (const exp of futureDates) {
      const dte = Math.max(1, Math.ceil((exp.getTime() - now) / 86_400_000));
      const chain =
        exp.getTime() === head.expirationDates?.[0]?.getTime() && head.options?.[0]
          ? head.options[0]
          : (await yahooFinance.options(symbol, { date: exp })).options?.[0];
      if (!chain) continue;

      const opts: { strike: number; openInterest: number; impliedVolatility: number; type: "call" | "put" }[] = [];
      const add = (o: ChainOption, type: "call" | "put") => {
        const oi = o.openInterest ?? 0;
        if (oi <= 0) return;
        opts.push({ strike: o.strike, openInterest: oi, impliedVolatility: o.impliedVolatility || 0.3, type });
      };
      for (const c of chain.calls ?? []) add(c as ChainOption, "call");
      for (const p of chain.puts ?? []) add(p as ChainOption, "put");
      if (opts.length === 0) continue;

      const gex = calculateGex(opts, spot, dte);
      netGex += gex.totalGex;
      for (const s of gex.byStrike) {
        strikeTotals.set(s.strike, (strikeTotals.get(s.strike) ?? 0) + s.totalGex);
      }
      contributing++;
    }

    if (contributing === 0 || strikeTotals.size === 0) {
      logger.warn(SRC, "No options with open interest", { symbol });
      return null;
    }

    // The pin: strike carrying the most gamma, restricted to a sane band around
    // spot so a far-dated tail strike can't masquerade as the pin.
    let pinStrike: number | null = null;
    let pinAbs = -1;
    for (const [strike, total] of Array.from(strikeTotals.entries())) {
      if (strike < spot * 0.9 || strike > spot * 1.1) continue;
      if (Math.abs(total) > pinAbs) {
        pinAbs = Math.abs(total);
        pinStrike = strike;
      }
    }
    if (pinStrike == null) return null;

    return {
      value: {
        symbol,
        spot: Math.round(spot * 100) / 100,
        pinStrike,
        // Positive = dealers long gamma (vol-dampening); negative = short.
        netGammaPositive: netGex >= 0,
        distancePct: Math.round(((pinStrike - spot) / spot) * 10000) / 100,
        expiriesUsed: contributing,
      },
      source: "Yahoo options (start-of-day OI)",
      asOf,
    };
  } catch (error) {
    logger.warn(SRC, "GEX pin unavailable", { symbol, error });
    return null;
  }
}
