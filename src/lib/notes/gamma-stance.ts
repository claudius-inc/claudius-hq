/**
 * Reading the dealer gamma stance off a note, old or new.
 *
 * `GexPinData` carries the same quantity under two opposite sign conventions,
 * one per era, and exactly one of the two fields is present on any given note.
 * Three separate renderers state the stance — the web page, the Telegram push,
 * and the model's fact sheet — and a fourth decides whether the model's prose
 * contradicts it. Four independent reads of a two-convention field is how the
 * eras get mixed, so it is resolved once here.
 *
 * A legacy note is reported AS WRITTEN, with `legacy: true`, never silently
 * flipped. `render.ts` dropped any model book line that disagreed with the
 * stored stance, so the archived prose beside the figure was selected to agree
 * with the inverted sign — flipping only the deterministic sentence would leave
 * the paragraph arguing with itself. The correction is stated instead.
 */
import type { GexPinData } from "@/lib/notes/types";

export interface GammaStance {
  /** +1 = dealers net long gamma (vol-dampening), −1 = short. As the note states it. */
  sign: 1 | -1;
  /** True when this came from the pre-correction field, so the stated sign is inverted. */
  legacy: boolean;
}

export function gammaStance(g: GexPinData): GammaStance | null {
  if (g.dealerGammaSign === 1 || g.dealerGammaSign === -1) {
    return { sign: g.dealerGammaSign, legacy: false };
  }
  if (typeof g.netGammaPositive === "boolean") {
    return { sign: g.netGammaPositive ? 1 : -1, legacy: true };
  }
  return null;
}

/** "long" / "short", for prose. */
export const stanceWord = (s: GammaStance): "long" | "short" => (s.sign === 1 ? "long" : "short");

/**
 * What a heavy strike DOES, from the sign of gamma at that strike.
 *
 * Not from the net: the book can be long gamma overall while the single heaviest
 * strike is put-dominated, and those are opposite readings. A pin draws price in;
 * a trigger accelerates through.
 *
 * Without `pinGex` the answer is "pin", unconditionally — never derived from the
 * net stance. Only notes written before `pinGex` existed lack it, and every one
 * of those said "pin" on the day it shipped. Deriving the noun from a stance
 * that is itself inverted would print "trigger" on an archived note that said
 * "pin", which is neither what it claimed at the time nor what the correction
 * beneath it says. The archive keeps its own words.
 */
export function pinNoun(g: GexPinData, _stance: GammaStance): "pin" | "trigger" {
  const at = g.pinGex;
  if (at != null && Number.isFinite(at) && at !== 0) return at > 0 ? "pin" : "trigger";
  return "pin";
}
