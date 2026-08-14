/**
 * Dealer gamma exposure.
 *
 * Two things this file gets right that its first version did not, both of which
 * changed the answer rather than tidying it:
 *
 * 1. **The dealer side.** Gamma exposure is `call gamma − put gamma`: customers
 *    systematically buy puts for protection and overwrite calls, so the dealer
 *    is long call gamma and short put gamma. The previous code had the signs
 *    reversed behind a comment that contradicted itself (it claimed dealers were
 *    short both, then added put gamma positively), so every published stance was
 *    the opposite of the truth. Measured on 2026-08-13: +0.82B, net long, on a
 *    day the note said "net short".
 *
 *    This is an ASSUMPTION about who is on the other side, not a measurement.
 *    The trade-side data that would settle it (CBOE Open-Close) is paid. Say so
 *    wherever the number is published.
 *
 * 2. **Every leg carries its own expiry.** Gamma scales roughly 1/sqrt(T), so
 *    pricing a 1-day chain at a 30-day T understates its gamma several-fold.
 *    `OptionLeg.daysToExpiry` is per leg, and the caller passes the whole
 *    multi-expiry book in one call.
 *
 * Deleted along the way, and deliberately not replaced: `maxPainStrike` (it was
 * the highest-OI strike, which is neither max pain nor a pin, computed in
 * quadratic time), `flipZone` (a cumulative-OI artefact, not a gamma flip — see
 * `zeroGammaLevel` for the real thing), and the `interpretGex` / `formatGex`
 * display helpers. Their only caller was an API route with no consumers.
 */

/** Standard normal PDF. */
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Black-Scholes gamma. Zero for any degenerate input rather than NaN. */
function calculateGamma(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normPdf(d1) / (S * sigma * Math.sqrt(T));
}

export interface OptionLeg {
  strike: number;
  openInterest: number;
  impliedVolatility: number;
  type: "call" | "put";
  /** Calendar days to THIS leg's expiry. Never a shared figure. */
  daysToExpiry: number;
}

export interface GexByStrike {
  strike: number;
  callGex: number;
  putGex: number;
  totalGex: number;
}

export interface GexResult {
  spotPrice: number;
  /** Positive = dealers net long gamma, which dampens moves. */
  totalGex: number;
  callGex: number;
  putGex: number;
  byStrike: GexByStrike[];
}

/** +1 for a call leg, −1 for a put leg — the dealer-side assumption, once. */
const legSign = (type: "call" | "put") => (type === "call" ? 1 : -1);

/**
 * Dollar gamma per 1% move, aggregated and split by strike.
 *
 * The per-strike sign is what decides whether a heavy strike is a magnet or an
 * accelerant, so it is preserved rather than folded into a magnitude.
 */
export function calculateGex(legs: OptionLeg[], spotPrice: number, riskFreeRate = 0.05): GexResult {
  const strikeMap = new Map<number, { callGex: number; putGex: number }>();
  let totalCallGex = 0;
  let totalPutGex = 0;

  for (const leg of legs) {
    const g = calculateGamma(spotPrice, leg.strike, leg.daysToExpiry / 365, riskFreeRate, leg.impliedVolatility);
    // 100 shares per contract; × spot again converts share gamma to dollars.
    const dollarGamma = g * leg.openInterest * 100 * spotPrice;

    let entry = strikeMap.get(leg.strike);
    if (!entry) {
      entry = { callGex: 0, putGex: 0 };
      strikeMap.set(leg.strike, entry);
    }
    if (leg.type === "call") {
      entry.callGex += dollarGamma;
      totalCallGex += dollarGamma;
    } else {
      entry.putGex -= dollarGamma;
      totalPutGex -= dollarGamma;
    }
  }

  const byStrike: GexByStrike[] = Array.from(strikeMap.entries())
    .map(([strike, d]) => ({
      strike,
      callGex: Math.round(d.callGex),
      putGex: Math.round(d.putGex),
      totalGex: Math.round(d.callGex + d.putGex),
    }))
    .sort((a, b) => a.strike - b.strike);

  return {
    spotPrice,
    totalGex: Math.round(totalCallGex + totalPutGex),
    callGex: Math.round(totalCallGex),
    putGex: Math.round(totalPutGex),
    byStrike,
  };
}

/** How far either side of spot the zero-gamma search looks. */
const ZERO_GAMMA_BAND = 0.2;

/**
 * The spot price at which total dealer gamma crosses zero — the regime boundary.
 *
 * This is NOT a running sum of per-strike gamma at today's spot, which is what
 * the deleted `flipZone` computed. Gamma is a function of spot, so the whole book
 * must be RE-PRICED at each candidate level.
 *
 * The `× 100 × S` dollar-gamma multiplier is omitted on purpose: `S > 0` across
 * the search band, so every positive-scalar variant of the objective has exactly
 * the same root, and no magnitude is displayed. Dropping it is one fewer
 * multiplication per evaluation across ~200k of them.
 *
 * Each side of spot is bracketed SEPARATELY, and the nearest crossing wins. A
 * single endpoint-to-endpoint test would miss the case where a root sits on each
 * side — the endpoints then agree in sign and the search reports nothing — and
 * the claim the caller renders is about the nearest boundary, not about the
 * existence of some root inside a 40%-wide band.
 *
 * `null` means "no crossing detected within the band". It does not mean there is
 * none, and the caller must not word it as though it did (§1a).
 */
export function zeroGammaLevel(legs: OptionLeg[], spotPrice: number, riskFreeRate = 0.05): number | null {
  if (legs.length === 0 || spotPrice <= 0) return null;

  const f = (S: number): number => {
    let sum = 0;
    for (const leg of legs) {
      sum +=
        legSign(leg.type) *
        calculateGamma(S, leg.strike, leg.daysToExpiry / 365, riskFreeRate, leg.impliedVolatility) *
        leg.openInterest;
    }
    return sum;
  };

  const roots = [
    bisect(f, spotPrice * (1 - ZERO_GAMMA_BAND), spotPrice),
    bisect(f, spotPrice, spotPrice * (1 + ZERO_GAMMA_BAND)),
  ].filter((r): r is number => r != null);

  if (roots.length === 0) return null;
  return roots.reduce((best, r) => (Math.abs(r - spotPrice) < Math.abs(best - spotPrice) ? r : best));
}

/** Root of `f` in [lo, hi], or null when the endpoints do not straddle one. */
function bisect(f: (s: number) => number, lo: number, hi: number): number | null {
  let a = lo;
  let b = hi;
  let fa = f(a);
  const fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa > 0 === fb > 0) return null;

  // 40 halvings of a 20%-wide bracket resolves to ~1e-10 of spot. The cost is
  // trivial next to the fetches, so precision is not the thing to economise on.
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (fa > 0 !== fm > 0) {
      b = m;
    } else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}
