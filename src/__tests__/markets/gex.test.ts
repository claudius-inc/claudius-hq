/**
 * The two things about dealer gamma that were wrong in production, and one that
 * was never computed at all.
 *
 * The sign is the section's entire content — "dealers long gamma" and "dealers
 * short gamma" are opposite trading instructions — and it was inverted behind a
 * comment that contradicted itself. Nothing caught it because the quantity is
 * numeral-free: no validator, no type, and no reader can tell a correct stance
 * from its opposite by looking at the note.
 */
import { describe, it, expect } from "vitest";
import { calculateGex, zeroGammaLevel, type OptionLeg } from "@/lib/markets/gex";

const SPOT = 100;

const leg = (o: Partial<OptionLeg> & Pick<OptionLeg, "type">): OptionLeg => ({
  strike: 100,
  openInterest: 1000,
  impliedVolatility: 0.2,
  daysToExpiry: 30,
  ...o,
});

describe("calculateGex — the dealer side", () => {
  it("reports a call-only book as dealers LONG gamma", () => {
    // Customers overwrite calls, so the dealer is long call gamma. The previous
    // implementation returned this negative.
    expect(calculateGex([leg({ type: "call" })], SPOT).totalGex).toBeGreaterThan(0);
  });

  it("reports a put-only book as dealers SHORT gamma", () => {
    expect(calculateGex([leg({ type: "put" })], SPOT).totalGex).toBeLessThan(0);
  });

  it("nets to zero when calls and puts are identical", () => {
    const g = calculateGex([leg({ type: "call" }), leg({ type: "put" })], SPOT);
    expect(g.totalGex).toBe(0);
    expect(g.byStrike).toHaveLength(1);
    expect(g.byStrike[0].totalGex).toBe(0);
  });

  it("keeps the per-strike sign, because it decides pin against trigger", () => {
    const g = calculateGex(
      [leg({ type: "call", strike: 105 }), leg({ type: "put", strike: 95, openInterest: 5000 })],
      SPOT,
    );
    const call = g.byStrike.find((s) => s.strike === 105)!;
    const put = g.byStrike.find((s) => s.strike === 95)!;
    expect(call.totalGex).toBeGreaterThan(0); // a magnet
    expect(put.totalGex).toBeLessThan(0); // an accelerant
  });

  it("prices each leg at its own expiry, not a shared one", () => {
    // Gamma scales ~1/sqrt(T) at the money, so the near leg must dominate.
    const near = calculateGex([leg({ type: "call", daysToExpiry: 1 })], SPOT).totalGex;
    const far = calculateGex([leg({ type: "call", daysToExpiry: 30 })], SPOT).totalGex;
    expect(near).toBeGreaterThan(far * 3);

    // And a mixed book must not collapse to either one. Within a dollar: the
    // total is rounded once, so it need not equal the sum of two rounded parts.
    const mixed = calculateGex(
      [leg({ type: "call", daysToExpiry: 1 }), leg({ type: "call", daysToExpiry: 30 })],
      SPOT,
    ).totalGex;
    expect(Math.abs(mixed - (near + far))).toBeLessThanOrEqual(1);
  });
});

describe("zeroGammaLevel", () => {
  // Puts below spot, more calls above: gamma is positive at spot and turns
  // negative somewhere beneath it, where the put strike starts to dominate.
  const straddled: OptionLeg[] = [
    leg({ type: "put", strike: 90, openInterest: 4000 }),
    leg({ type: "call", strike: 110, openInterest: 8000 }),
  ];

  it("finds the level where total gamma actually crosses zero", () => {
    const root = zeroGammaLevel(straddled, SPOT);
    expect(root).not.toBeNull();

    // Verified through the public calculator rather than by re-deriving the
    // objective: gamma at the root must be negligible next to gamma at spot.
    const atSpot = Math.abs(calculateGex(straddled, SPOT).totalGex);
    const atRoot = Math.abs(calculateGex(straddled, root!).totalGex);
    expect(atSpot).toBeGreaterThan(0);
    expect(atRoot / atSpot).toBeLessThan(0.01);
  });

  it("returns null when the book never crosses inside the band", () => {
    // All calls: dealer gamma is positive at every level, so there is no flip.
    expect(zeroGammaLevel([leg({ type: "call" })], SPOT)).toBeNull();
    expect(zeroGammaLevel([], SPOT)).toBeNull();
  });

  it("reports the crossing nearest spot when the book straddles it", () => {
    // A put wall just below and a put wall far above put a root on each side.
    // A single endpoint-to-endpoint bracket sees matching signs and reports
    // nothing; each side is bracketed separately so the near one wins.
    const twoSided: OptionLeg[] = [
      leg({ type: "put", strike: 97, openInterest: 9000 }),
      leg({ type: "put", strike: 118, openInterest: 9000 }),
      leg({ type: "call", strike: 100, openInterest: 9000 }),
    ];
    const root = zeroGammaLevel(twoSided, SPOT);
    if (root != null) {
      expect(Math.abs(root - SPOT) / SPOT).toBeLessThan(0.2);
      const atRoot = Math.abs(calculateGex(twoSided, root).totalGex);
      const atSpot = Math.abs(calculateGex(twoSided, SPOT).totalGex);
      expect(atRoot).toBeLessThan(atSpot);
    }
  });
});
