// Tokens with an explicit canonical casing. Wins over algorithmic Title Case.
// Key = uppercase form; value = canonical form. Easy to extend.
const CANONICAL_CASE: Record<string, string> = {
  // English legal suffixes — Title Case
  INC: "Inc",
  LTD: "Ltd",
  LTDA: "Ltda",
  CORP: "Corp",
  CO: "Co",
  COMPANY: "Company",
  HOLDINGS: "Holdings",

  // Continental-Europe corporate suffixes — kept uppercase
  SE: "SE",
  SA: "SA",
  SAB: "SAB",
  AG: "AG",
  NV: "NV",
  BV: "BV",
  LLC: "LLC",
  LP: "LP",
  KK: "KK",
  ASA: "ASA",
  AB: "AB",
  AS: "AS",
  // UK / Irish convention is lowercase "plc"
  PLC: "plc",
  // Mixed-case canonicals
  GMBH: "GmbH",
  OYJ: "Oyj",

  // Asset / structural classes
  REIT: "REIT",
  ETF: "ETF",
  ADR: "ADR",
  AI: "AI",
  IT: "IT",
  IP: "IP",
  ESG: "ESG",
  USA: "USA",
  UK: "UK",
  EU: "EU",
  IPO: "IPO",
  "R&D": "R&D",
  "M&A": "M&A",
  ASEAN: "ASEAN",
  OECD: "OECD",

  // Brand acronyms / initialisms commonly seen in this universe
  DBS: "DBS",
  SIA: "SIA",
  IHH: "IHH",
  AIA: "AIA",
  CPIC: "CPIC",
  SMIC: "SMIC",
  CATL: "CATL",
  KDDI: "KDDI",
  ANA: "ANA",
  JAL: "JAL",
  SBI: "SBI",
  HDFC: "HDFC",
  ICICI: "ICICI",
  TCS: "TCS",
  BHP: "BHP",
  LVMH: "LVMH",
  MGM: "MGM",
  NRG: "NRG",
  EOG: "EOG",
  RTX: "RTX",
  KLA: "KLA",
  AMD: "AMD",
  IBM: "IBM",
  HP: "HP",
  GE: "GE",
  GM: "GM",
  BMW: "BMW",
  BYD: "BYD",
  NIO: "NIO",
  XPEV: "XPEV",
  BABA: "BABA",
  LG: "LG",
  SK: "SK",
  NC: "NC",
  JCET: "JCET",
  KAL: "KAL",
  POSCO: "POSCO",
  SBP: "SBP",
  "MS&AD": "MS&AD",
  OCBC: "OCBC",
  UOB: "UOB",
  STI: "STI",
  REE: "REE",
  "AT&T": "AT&T",
  MARA: "MARA",
  MP: "MP",
  PENN: "PENN",
  SES: "SES",
  VNET: "VNET",
  YPF: "YPF",
  ODDITY: "ODDITY",
  QUALCOMM: "Qualcomm",
  NVIDIA: "NVIDIA",
  AFLAC: "AFLAC",
  AGCO: "AGCO",
  EVGO: "EVgo",
  L3HARRIS: "L3Harris",
  // HK / SGX / US brand acronyms missed in initial pass
  "HK&S": "HK&S",
  WH: "WH",
  CSPC: "CSPC",
  SITC: "SITC",
  COFCO: "COFCO",
  BEONE: "BeOne",
  EHANG: "EHang",
  AXA: "AXA",
  AST: "AST",
  BWX: "BWX",
  CF: "CF",
  FMC: "FMC",
  GH: "GH",
  CRISPR: "CRISPR",
  ASML: "ASML",
  COMPASS: "COMPASS",
  // HK share-class suffixes
  SW: "SW",
  NW: "NW",
};

// Particles lowercased when they sit between other words.
const LOWERCASE_PARTICLES = new Set<string>([
  "de", "da", "do", "of", "the", "and", "von", "van", "der", "den",
  "le", "la", "el", "y",
]);

// Strip a trailing run of whitespace followed by a single stray letter — e.g.
// "ALLIANZ SE                    v" → "ALLIANZ SE". Yahoo seems to occasionally
// suffix a one-char artifact after long padding.
function stripTrailingArtifact(s: string): string {
  return s.replace(/\s{4,}[A-Za-z]\s*$/, "");
}

// True if the token already has a lowercase letter immediately followed by an
// uppercase letter — "PayPal", "iPhone", "BeOne". Treated as intentional brand
// casing and left untouched.
function looksIntentionallyMixed(token: string): boolean {
  return /[a-z][A-Z]/.test(token);
}

function capitalizeWord(word: string): string {
  if (word.length === 0) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

// Title-case a single space-delimited token. Handles hyphens and slashes
// internally so "ROLLS-ROYCE" becomes "Rolls-Royce" and "SHIP/HOLD" becomes
// "Ship/Hold".
function titleCaseToken(token: string, isFirst: boolean, isLast: boolean): string {
  if (token.length === 0) return token;
  if (looksIntentionallyMixed(token)) return token;

  const upper = token.toUpperCase();
  if (CANONICAL_CASE[upper]) return CANONICAL_CASE[upper];

  // Dotted initialism on the whole token (e.g. "C.V.", "S.A.B."). Check before
  // we strip the trailing dot so single-letter-pair forms like "C.V." match.
  if (/^([A-Za-z]\.){2,}$/.test(token)) return upper;

  // Strip a trailing punctuation run for the canonical-case lookup, then
  // reattach. Handles "Inc.", "(LTD)".
  const trailingPunctMatch = token.match(/[.,;:!?)\]}]+$/);
  const trailingPunct = trailingPunctMatch ? trailingPunctMatch[0] : "";
  const leadingPunctMatch = token.match(/^[(\[{"']+/);
  const leadingPunct = leadingPunctMatch ? leadingPunctMatch[0] : "";
  const core = token.slice(leadingPunct.length, token.length - trailingPunct.length);

  const canonicalCore = CANONICAL_CASE[core.toUpperCase()];
  if (canonicalCore) {
    return leadingPunct + canonicalCore + trailingPunct;
  }

  // Particle: lowercase only when not first/last in the name.
  if (!isFirst && !isLast && LOWERCASE_PARTICLES.has(core.toLowerCase())) {
    return leadingPunct + core.toLowerCase() + trailingPunct;
  }

  // Recurse on sub-tokens split by hyphen / slash so each piece title-cases.
  if (/[-/]/.test(core)) {
    const parts = core.split(/([-/])/);
    const rebuilt = parts
      .map((p) => (p === "-" || p === "/" ? p : titleCaseToken(p, false, false)))
      .join("");
    return leadingPunct + rebuilt + trailingPunct;
  }

  // Initialism with internal periods (e.g. "S.A.B." or "C.V.") — uppercase it.
  if (/^([A-Za-z]\.){2,}[A-Za-z]?\.?$/.test(core)) {
    return leadingPunct + core.toUpperCase() + trailingPunct;
  }

  return leadingPunct + capitalizeWord(core) + trailingPunct;
}

export function titleCaseCompanyName(raw: string): string {
  if (!raw) return raw;

  const cleaned = stripTrailingArtifact(raw).trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) return cleaned;

  const tokens = cleaned.split(" ");
  return tokens
    .map((tok, i) => titleCaseToken(tok, i === 0, i === tokens.length - 1))
    .join(" ");
}
