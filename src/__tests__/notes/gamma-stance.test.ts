/**
 * Two sign conventions live in the archive, one per era, and the renderers must
 * never mix them.
 *
 * Every note written before the correction stores `netGammaPositive` under the
 * inverted `put − call` convention; every note since stores `dealerGammaSign`
 * under the published `call − put` one. The failure this guards is silent in
 * both directions: read a legacy note as current and the page states the
 * opposite of the truth; write both fields and a single field name means
 * opposite things on adjacent days.
 */
import { describe, it, expect } from "vitest";
import { gammaStance, stanceWord, pinNoun } from "@/lib/notes/gamma-stance";
import type { GexPinData } from "@/lib/notes/types";

const base: GexPinData = {
  symbol: "SPY",
  spot: 772.49,
  pinStrike: 775,
  distancePct: 0.32,
  expiriesUsed: 13,
};

describe("gammaStance", () => {
  it("reads a current note from dealerGammaSign", () => {
    expect(gammaStance({ ...base, dealerGammaSign: 1 })).toEqual({ sign: 1, legacy: false });
    expect(gammaStance({ ...base, dealerGammaSign: -1 })).toEqual({ sign: -1, legacy: false });
  });

  it("reads a legacy note as written, and flags it", () => {
    // Reported as stored, NOT flipped: `render.ts` dropped any model book line
    // that disagreed with the stored stance, so the archived prose beside the
    // figure was selected to agree with it. Flipping only the deterministic
    // sentence would leave the paragraph arguing with itself.
    expect(gammaStance({ ...base, netGammaPositive: true })).toEqual({ sign: 1, legacy: true });
    expect(gammaStance({ ...base, netGammaPositive: false })).toEqual({ sign: -1, legacy: true });
  });

  it("prefers the current field when a note somehow carries both", () => {
    const both = { ...base, dealerGammaSign: -1 as const, netGammaPositive: true };
    expect(gammaStance(both)).toEqual({ sign: -1, legacy: false });
  });

  it("returns null when neither field is present", () => {
    expect(gammaStance(base)).toBeNull();
  });
});

describe("pinNoun", () => {
  const long = { sign: 1 as const, legacy: false };
  const short = { sign: -1 as const, legacy: false };

  it("takes the sign AT the strike, not the net", () => {
    // The book can be long gamma overall while its heaviest strike is
    // put-dominated. Those are opposite readings, and the strike wins.
    expect(pinNoun({ ...base, pinGex: -5e8 }, long)).toBe("trigger");
    expect(pinNoun({ ...base, pinGex: 5e8 }, short)).toBe("pin");
  });

  it("says pin on a note written before pinGex existed, whatever the stance", () => {
    // Those notes all printed "pin". Deriving "trigger" from a stance that is
    // itself inverted would put a word in the archive that the note never used
    // and the correction beneath it does not license.
    expect(pinNoun(base, long)).toBe("pin");
    expect(pinNoun(base, short)).toBe("pin");
    expect(pinNoun({ ...base, netGammaPositive: false, pinGex: 0 }, short)).toBe("pin");
  });
});

describe("stanceWord", () => {
  it("is the word the note prints", () => {
    expect(stanceWord({ sign: 1, legacy: false })).toBe("long");
    expect(stanceWord({ sign: -1, legacy: true })).toBe("short");
  });
});
