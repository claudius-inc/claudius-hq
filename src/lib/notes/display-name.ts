/**
 * Company names for display.
 *
 * `StructuredFacts.companyNames` comes straight out of the SPDR holdings files,
 * which are all-caps fixed-width exports: "THE CIGNA GROUP", "DATADOG INC
 * CLASS A" (three internal spaces), "CROWDSTRIKE HOLDINGS INC   A". Printed
 * verbatim on a web page they shout, and the share-class tail is noise beside a
 * ticker that already identifies the line.
 *
 * The push does NOT use this: there, company names appear only inside
 * attribution phrases composed by the assembler, and rewriting a phrase the
 * numeral validator already cleared would be a §1b violation.
 */

/** Tokens that stay upper-case — acronyms and initialisms the title-caser would ruin. */
const KEEP_UPPER = new Set([
  "NRG", "APA", "AES", "DTE", "PPL", "PNC", "BNY", "MSCI", "IBM", "AT&T", "3M",
  "CME", "ICE", "PNW", "CBRE", "GE", "HP", "AIG", "MGM", "KLA", "NXP", "ADP",
  "EPAM", "FMC", "IQVIA", "TE", "USA", "US", "UPS", "NVR", "EQT", "WEC", "CSX",
  "T", "V", "II", "III", "IV",
]);

/**
 * Brands whose own casing is neither all-caps nor title case. Keyed by the
 * upper-cased token, so the lookup happens before any casing rule runs. Only
 * names that actually appear in an S&P 500 holdings file belong here.
 */
const BRAND_CASE: Record<string, string> = {
  NVIDIA: "NVIDIA",
  NETAPP: "NetApp",
  COSTAR: "CoStar",
  PAYPAL: "PayPal",
  EBAY: "eBay",
  MICROCHIP: "Microchip",
  SALESFORCE: "Salesforce",
  ONSEMI: "onsemi",
  MONGODB: "MongoDB",
  YETI: "YETI",
  IQVIA: "IQVIA",
  EQIX: "Equinix",
  SANDISK: "SanDisk",
};

/** Tokens that stay lower-case unless they lead. */
const KEEP_LOWER = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to"]);

/**
 * Legal-form and share-class tails to drop. Only ever stripped from the END, so
 * a name that genuinely contains the word ("Marathon Petroleum Corp" → yes;
 * "Corning Inc" → the "Corning" is untouched) keeps its identity.
 */
const TRAILING_NOISE =
  /\s+(?:(?:CL(?:ASS)?\s+)?[A-C]|INC(?:ORPORATED)?|CORP(?:ORATION)?|CO|COMPANY|PLC|LTD|LIMITED|HOLDINGS?|GROUP|SA|NV|AG|LP|LLC|TRUST|REIT)\.?$/i;

function titleCaseWord(word: string, isFirst: boolean): string {
  const bare = word.replace(/[^A-Za-z&]/g, "");
  const brand = BRAND_CASE[bare.toUpperCase()];
  if (brand) return brand;
  if (KEEP_UPPER.has(bare.toUpperCase()) && bare.length <= 5) return word.toUpperCase();
  const lower = word.toLowerCase();
  if (!isFirst && KEEP_LOWER.has(lower)) return lower;
  // Hyphenated and slashed compounds capitalise on both sides.
  return lower.replace(/(^|[-/])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * "CROWDSTRIKE HOLDINGS INC   A" → "Crowdstrike". "THE CIGNA GROUP" → "The
 * Cigna". Returns null for an empty/absent input so a caller can fall back to
 * the bare ticker rather than printing an empty cell.
 */
export function displayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Collapse the fixed-width padding first — otherwise the trailing-noise
  // pattern never matches "INC   A".
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return null;

  // The holdings files write an ampersand as a plus: "ELI LILLY + CO",
  // "JOHNSON + JOHNSON". Restored before anything else so the tail stripper
  // sees a normal name, and so an internal one renders as the company's own
  // punctuation rather than as arithmetic.
  s = s.replace(/\s\+\s/g, " & ");

  // Strip repeatedly: "INC   A" is two tails, and so is "HOLDINGS INC".
  for (let i = 0; i < 3; i++) {
    const next = s.replace(TRAILING_NOISE, "").trim();
    // Never strip away the whole name — "APA CORP" must not become "".
    if (!next || next === s) break;
    s = next;
  }

  // A leading article is only there to agree with the legal form that has just
  // been stripped: "THE CIGNA GROUP" reads as "The Cigna" once "GROUP" is gone,
  // where the company is simply Cigna. Guarded so a one-word name survives.
  const deArticled = s.replace(/^THE\s+/i, "").trim();
  if (deArticled) s = deArticled;

  // Stripping the legal form can orphan the conjunction that joined it:
  // "ELI LILLY & CO" loses "CO" and reads "Eli Lilly &" on the page. Guarded
  // like every other strip here, so a name that is nothing but punctuation is
  // left alone rather than emptied.
  const deTrailed = s.replace(/[\s&+,.\-]+$/, "").trim();
  if (deTrailed) s = deTrailed;

  return s
    .split(" ")
    .map((w, i) => titleCaseWord(w, i === 0))
    .join(" ");
}
