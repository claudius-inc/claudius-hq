/**
 * Numeral validation — see docs/daily-note-spec.md §8.3.
 *
 * The §1a enforcement core: LLM prose may cite ONLY numbers present in
 * StructuredFacts. This is a token grammar, not blanket numeral matching:
 * structural tokens (clock/ratio colon-forms, tenor labels, MA/period names,
 * years, small counts) are whitelisted; every remaining numeral must map to a
 * derived fact value within a capped, rounding-aware tolerance (see isSupported)
 * that accepts §1's rounding ("VIX 14" ≈ 14.2, "$79" ≈ 79.1, "7,704" ≈ 7704.12).
 *
 * Known, accepted simplifications (documented deviations from §8.3): the fact
 * pool is unit-blind (a "24%" can match a 24bp fact); spelled-out numbers ("five
 * percent") and colon-ratios/small counts (≤12) are not validated against their
 * specific fact. These are guard-not-proof gaps; the tolerance cap keeps level
 * fabrication out, which is the material §1a risk.
 */
import type { StructuredFacts } from "@/lib/notes/types";

/** Every numeric value the LLM is allowed to reference, as a flat pool. */
export function collectAllowedNumbers(f: StructuredFacts): number[] {
  const out: number[] = [];
  const push = (...ns: (number | null | undefined)[]) => {
    for (const n of ns) if (n != null && Number.isFinite(n)) out.push(Math.abs(n));
  };

  if (f.indices) for (const i of f.indices.value) push(i.close, i.changePct);
  if (f.rates) {
    const r = f.rates.value;
    push(r.y2, r.y10, r.y30, r.chg2Bp, r.chg10Bp, r.chg30Bp, r.spread2s10Bp, r.spread2s10ChgBp);
  }
  if (f.vix) {
    const v = f.vix.value;
    push(v.level, v.change, v.ytdLow, v.ytdHigh, v.percentile, v.trendDays);
  }
  if (f.crossAsset)
    for (const c of f.crossAsset.value) {
      push(c.price, c.changePct);
      if (c.label === "BTC") push(c.price / 1000); // "$118k"
    }
  if (f.sectors) for (const s of f.sectors.value) push(s.changePct);
  if (f.breadth) {
    const bd = f.breadth.value;
    push(bd.advances, bd.declines, bd.ratio, bd.newHighs, bd.newLows);
  }
  if (f.divergence)
    for (const d of f.divergence.value) {
      push(d.sectorChangePct);
      for (const n of d.names) push(n.changePct, n.gap);
    }
  if (f.contribution) {
    const c = f.contribution.value;
    push(c.modelledPct, c.actualPct, c.topPoints, c.exTopPct, c.topNames.length);
  }
  if (f.gexPin) {
    const g = f.gexPin.value;
    push(g.spot, g.pinStrike, g.distancePct);
  }
  if (f.econEvents) for (const e of f.econEvents.value) push(e.consensus, e.previous);
  if (f.spotlight)
    for (const s of f.spotlight.value) {
      push(s.headlinePct, s.price, s.proxy?.changePct);
      for (const n of [...s.leaders, ...s.laggards]) push(n.changePct);
    }
  return out;
}

// Structural tokens that are legitimately NOT facts. Stripped before numeral
// extraction. The `(?<![$\d.,])` lookbehind stops a fabricated level from
// hiding inside a structural pattern (e.g. "$4,300-day", "4300Y", "$2025") —
// only a genuinely standalone token is stripped.
const WHITELIST = [
  /(?<![$\d.,])\b\d{1,2}:\d{2}\b/g, // clock ("8:30") or ratio ("3:2") colon-forms
  /(?<![$\d.,])\b\d{1,2}-(?:day|week|month|year|hour|min)s?\b/gi, // MA / period names
  /(?<![$\d.,])\b(?:19|20)\d{2}\b(?![%k\d])/gi, // years (not $-prefixed, not %/k-suffixed)
  /(?<![$\d.,])\b\d{1,2}Y\b/g, // tenor labels (2Y/10Y/30Y)
  /(?<![$\d.,])\b\d{1,2}s\d{1,2}s\b/g, // curve labels (2s10s)
];

interface Numeral {
  raw: string;
  value: number; // absolute magnitude
}

/** Extract candidate fact-numerals from prose, minus whitelisted structure. */
export function extractNumerals(text: string): Numeral[] {
  let t = text;
  for (const re of WHITELIST) t = t.replace(re, " ");

  const out: Numeral[] = [];
  const re = /-?\$?\d[\d,]*(?:\.\d+)?k?%?(?:\s?bp)?/gi;
  for (const m of Array.from(t.matchAll(re))) {
    const raw = m[0];
    const hasSuffix = /[%$k]|bp/i.test(raw);
    const numPart = raw.replace(/[$,%]/g, "").replace(/\s?bp/i, "").replace(/k$/i, "");
    let value = parseFloat(numPart);
    if (!Number.isFinite(value)) continue;
    if (/k$/i.test(raw.replace(/[$,]/g, ""))) value *= 1000;

    // Whitelist bare small integers (counts / sector numbers / "3 days"):
    // an integer 0–12 with no $/%/bp/k suffix carries no price meaning here.
    if (!hasSuffix && Number.isInteger(value) && Math.abs(value) <= 12) continue;

    out.push({ raw, value: Math.abs(value) });
  }
  return out;
}

/**
 * True if `v` is within a rounding-aware tolerance of some allowed number.
 * Tolerance = 2% relative, floored at 0.05 and CAPPED at 0.5 absolute. The cap
 * is what makes levels strict: rounding an integer needs only ±0.5 (VIX 14≈14.2,
 * $79≈79.1, 7,704≈7,704.12, BTC/1000 118≈118.4 all fit), so a hallucinated
 * "6,700" vs a 6,600 close (Δ100) fails instead of sliding through a ±132 window.
 */
function isSupported(v: number, allowed: number[]): boolean {
  for (const a of allowed) {
    const tol = Math.min(Math.max(Math.abs(a) * 0.02, 0.05), 0.5);
    if (Math.abs(v - a) <= tol) return true;
  }
  return false;
}

export interface ValidationResult {
  ok: boolean;
  /** Raw numeral strings in the prose with no supporting fact. */
  unsupported: string[];
}

/** Validate one prose string against the fact pool. */
export function validateProseField(text: string, allowed: number[]): ValidationResult {
  const unsupported = extractNumerals(text)
    .filter((n) => !isSupported(n.value, allowed))
    .map((n) => n.raw);
  return { ok: unsupported.length === 0, unsupported };
}
