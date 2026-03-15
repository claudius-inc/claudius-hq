// Macro indicator definitions with educational context

export interface MacroIndicator {
  id: string;
  name: string;
  fredCode: string;
  category: "rates" | "inflation" | "employment" | "growth" | "sentiment" | "credit" | "fx" | "foreign-yields" | "fiscal" | "liquidity";
  unit: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  
  // Educational context
  description: string;
  whyItMatters: string;
  
  // Interpretation ranges
  ranges: {
    label: string;
    min: number | null;
    max: number | null;
    meaning: string;
    marketImpact: string;
  }[];
  
  // What to watch for
  keyLevels?: { level: number; significance: string }[];
  
  // Related assets
  affectedAssets: string[];
}

export const MACRO_INDICATORS: MacroIndicator[] = [
  // === INTEREST RATES ===
  {
    id: "fed-funds",
    name: "Fed Funds Rate",
    fredCode: "FEDFUNDS",
    category: "rates",
    unit: "%",
    frequency: "monthly",
    description: "The interest rate at which banks lend to each other overnight. Set by the Federal Reserve as their primary monetary policy tool.",
    whyItMatters: "The most important rate in finance. It influences ALL other interest rates — mortgages, car loans, corporate bonds, and the discount rate used to value stocks. When the Fed raises rates, borrowing becomes expensive, slowing the economy and pressuring asset prices.",
    ranges: [
      { label: "Crisis/ZIRP", min: null, max: 0.5, meaning: "Emergency monetary policy", marketImpact: "Bullish for risk assets, bearish for savers" },
      { label: "Accommodative", min: 0.5, max: 2.5, meaning: "Policy supporting growth", marketImpact: "Generally supportive for stocks and real estate" },
      { label: "Neutral", min: 2.5, max: 4.0, meaning: "Neither stimulating nor restricting", marketImpact: "Economy running on its own fundamentals" },
      { label: "Restrictive", min: 4.0, max: 6.0, meaning: "Policy slowing the economy", marketImpact: "Headwind for stocks, bonds rally when cuts expected" },
      { label: "Very Restrictive", min: 6.0, max: null, meaning: "Aggressive inflation fighting", marketImpact: "Recession risk high, cash becomes attractive" },
    ],
    keyLevels: [
      { level: 0, significance: "Zero lower bound - Fed out of conventional ammo" },
      { level: 2.5, significance: "Rough 'neutral rate' estimate" },
      { level: 5.0, significance: "Pre-2008 normal, now considered restrictive" },
    ],
    affectedAssets: ["All stocks", "Bonds (inverse)", "REITs (inverse)", "Growth stocks (high sensitivity)"],
  },
  {
    id: "10y-yield",
    name: "10-Year Treasury Yield",
    fredCode: "DGS10",
    category: "rates",
    unit: "%",
    frequency: "daily",
    description: "The yield on 10-year US government bonds. Considered the 'risk-free rate' and benchmark for pricing all long-term assets.",
    whyItMatters: "The 10Y yield is the denominator in every stock valuation model. When it rises, future cash flows are worth less today → stock prices fall. It also sets the floor for mortgage rates and corporate borrowing costs.",
    ranges: [
      { label: "Extremely Low", min: null, max: 2.0, meaning: "Flight to safety or deflation fears", marketImpact: "Growth stocks outperform, dividend stocks less attractive" },
      { label: "Low", min: 2.0, max: 3.0, meaning: "Accommodative financial conditions", marketImpact: "Supportive for equity valuations" },
      { label: "Moderate", min: 3.0, max: 4.5, meaning: "Historical normal range", marketImpact: "Balanced environment, fundamentals matter more" },
      { label: "Elevated", min: 4.5, max: 5.5, meaning: "Tight financial conditions", marketImpact: "Pressure on valuations, especially growth/tech" },
      { label: "High", min: 5.5, max: null, meaning: "Very restrictive, pre-2008 levels", marketImpact: "Significant headwind for equities, bonds competitive" },
    ],
    keyLevels: [
      { level: 3.0, significance: "Psychological level, often resistance" },
      { level: 4.0, significance: "2023-24 cycle highs" },
      { level: 5.0, significance: "Pre-GFC average, major psychological level" },
    ],
    affectedAssets: ["Growth stocks (high sensitivity)", "REITs (inverse)", "Utilities (inverse)", "Banks (complex - steeper curve helps)"],
  },
  {
    id: "yield-curve",
    name: "Yield Curve (10Y - 2Y)",
    fredCode: "T10Y2Y",
    category: "rates",
    unit: "bps",
    frequency: "daily",
    description: "The spread between 10-year and 2-year Treasury yields. Normally positive (longer = higher yield).",
    whyItMatters: "The most reliable recession indicator. An inverted curve (negative spread) has preceded every recession since 1970. It signals markets expect the Fed to cut rates due to economic weakness.",
    ranges: [
      { label: "Deeply Inverted", min: null, max: -50, meaning: "Strong recession signal", marketImpact: "Historically: recession in 6-18 months, but timing uncertain" },
      { label: "Inverted", min: -50, max: 0, meaning: "Recession warning", marketImpact: "Defensive positioning, quality over growth" },
      { label: "Flat", min: 0, max: 50, meaning: "Uncertain/transitional", marketImpact: "Watch for steepening (bullish) or further inversion" },
      { label: "Normal", min: 50, max: 150, meaning: "Healthy economy expected", marketImpact: "Banks benefit, cyclicals can outperform" },
      { label: "Steep", min: 150, max: null, meaning: "Strong growth expected or inflation concerns", marketImpact: "Favor value, cyclicals, banks" },
    ],
    keyLevels: [
      { level: 0, significance: "Inversion threshold - recession watch begins" },
      { level: -100, significance: "Deep inversion, only seen in severe tightening cycles" },
    ],
    affectedAssets: ["Banks (positive slope helps)", "Cyclicals", "Recession hedges"],
  },
  
  {
    id: "tips-10y",
    name: "10Y TIPS Yield (Real)",
    fredCode: "DFII10",
    category: "rates",
    unit: "%",
    frequency: "daily",
    description: "The yield on 10-year Treasury Inflation-Protected Securities. Represents the real (inflation-adjusted) cost of borrowing for the US government.",
    whyItMatters: "The #1 driver of gold prices. Negative real yields mean bondholders are guaranteed to lose purchasing power, making gold (which pays no yield) relatively attractive. When TIPS yields rise above ~1.5-2%, gold faces significant headwinds.",
    ranges: [
      { label: "Deeply Negative", min: null, max: -0.5, meaning: "Financial repression", marketImpact: "Very bullish for gold, negative real returns on bonds" },
      { label: "Negative", min: -0.5, max: 0, meaning: "Mildly negative real rates", marketImpact: "Supportive for gold and real assets" },
      { label: "Low Positive", min: 0, max: 1, meaning: "Modest real return on bonds", marketImpact: "Neutral for gold, watch direction" },
      { label: "Moderate", min: 1, max: 2, meaning: "Meaningful real return available", marketImpact: "Headwind for gold, opportunity cost rises" },
      { label: "Restrictive", min: 2, max: null, meaning: "High real rates, tight conditions", marketImpact: "Strong headwind for gold, thesis change trigger" },
    ],
    keyLevels: [
      { level: 0, significance: "Gold inflection point — negative = bullish" },
      { level: 2, significance: "Thesis change trigger — gold headwind zone" },
    ],
    affectedAssets: ["Gold (inverse)", "Silver (inverse)", "TIPS", "Real assets"],
  },

  // === INFLATION ===
  {
    id: "5y5y-breakeven",
    name: "5Y5Y Forward Breakeven",
    fredCode: "T5YIFR",
    category: "inflation",
    unit: "%",
    frequency: "daily",
    description: "The 5-year forward inflation expectation rate starting 5 years from now. The Fed's preferred measure of long-term inflation expectations.",
    whyItMatters: "Shows where markets expect inflation to be 5-10 years out. Above 2.5% signals inflation expectations are becoming unanchored — bullish for gold as a monetary debasement hedge. Below 2% suggests deflation risk.",
    ranges: [
      { label: "Anchored Low", min: null, max: 2, meaning: "Below Fed target, deflation risk", marketImpact: "Fed may ease, mixed for gold" },
      { label: "Target", min: 2, max: 2.5, meaning: "At Fed's comfort zone", marketImpact: "Neutral, expectations well-anchored" },
      { label: "Elevated", min: 2.5, max: 3, meaning: "Above target, debasement concerns", marketImpact: "Supports gold thesis, inflation hedge demand" },
      { label: "Unanchored", min: 3, max: null, meaning: "Expectations de-anchoring", marketImpact: "Very bullish for gold and inflation hedges" },
    ],
    keyLevels: [
      { level: 2, significance: "Fed's 2% target" },
      { level: 2.5, significance: "Gold support threshold — above here bullish" },
    ],
    affectedAssets: ["Gold", "TIPS", "Commodities", "Inflation hedges"],
  },
  {
    id: "cpi",
    name: "CPI Inflation (YoY)",
    fredCode: "CPIAUCSL",
    category: "inflation",
    unit: "% YoY",
    frequency: "monthly",
    description: "Consumer Price Index - measures the average change in prices paid by urban consumers for a basket of goods and services.",
    whyItMatters: "Inflation erodes purchasing power and forces the Fed to raise rates. High inflation = Fed tightening = headwind for assets. Low inflation = Fed can ease = supportive for assets. Unexpected inflation moves markets most.",
    ranges: [
      { label: "Deflation Risk", min: null, max: 1.0, meaning: "Economy too weak, deflation fears", marketImpact: "Fed easing likely, but growth concerns" },
      { label: "Target Zone", min: 1.0, max: 2.5, meaning: "Fed's comfort zone (~2% target)", marketImpact: "Goldilocks - supportive for risk assets" },
      { label: "Above Target", min: 2.5, max: 4.0, meaning: "Fed watching closely", marketImpact: "Hawkish Fed, but manageable" },
      { label: "Elevated", min: 4.0, max: 6.0, meaning: "Fed actively fighting inflation", marketImpact: "Rate hikes, pressure on P/E multiples" },
      { label: "High", min: 6.0, max: null, meaning: "Inflation crisis mode", marketImpact: "Aggressive tightening, stagflation risk" },
    ],
    keyLevels: [
      { level: 2.0, significance: "Fed's official target" },
      { level: 3.0, significance: "Upper bound of 'transitory' tolerance" },
      { level: 5.0, significance: "Forces aggressive Fed response" },
    ],
    affectedAssets: ["TIPS (hedge)", "Gold (hedge)", "Growth stocks (hurt by higher rates)", "Value/commodities (relative winners)"],
  },
  {
    id: "core-pce",
    name: "Core PCE Inflation (YoY)",
    fredCode: "PCEPILFE",
    category: "inflation",
    unit: "% YoY",
    frequency: "monthly",
    description: "Personal Consumption Expenditures Price Index excluding food and energy. The Fed's PREFERRED inflation measure.",
    whyItMatters: "This is what the Fed actually targets, not CPI. Core PCE tends to run ~0.3% lower than Core CPI. If you want to predict Fed moves, watch this number.",
    ranges: [
      { label: "Below Target", min: null, max: 1.8, meaning: "Fed may ease", marketImpact: "Dovish Fed, supportive for risk" },
      { label: "At Target", min: 1.8, max: 2.3, meaning: "Fed happy", marketImpact: "Stable policy, goldilocks" },
      { label: "Above Target", min: 2.3, max: 3.5, meaning: "Fed uncomfortable", marketImpact: "Hawkish bias, watching for persistence" },
      { label: "Elevated", min: 3.5, max: null, meaning: "Fed in inflation-fighting mode", marketImpact: "Rates higher for longer" },
    ],
    affectedAssets: ["All rate-sensitive assets", "Fed policy expectations"],
  },

  // === EMPLOYMENT ===
  {
    id: "unemployment",
    name: "Unemployment Rate",
    fredCode: "UNRATE",
    category: "employment",
    unit: "%",
    frequency: "monthly",
    description: "Percentage of the labor force that is jobless and actively seeking employment.",
    whyItMatters: "The Fed has a dual mandate: price stability AND maximum employment. Low unemployment = strong economy but potential wage inflation. Rising unemployment = recession risk but Fed may cut rates.",
    ranges: [
      { label: "Full Employment", min: null, max: 4.0, meaning: "Very tight labor market", marketImpact: "Wage pressure, Fed may tighten" },
      { label: "Healthy", min: 4.0, max: 5.0, meaning: "NAIRU range (natural rate)", marketImpact: "Balanced, sustainable growth" },
      { label: "Softening", min: 5.0, max: 6.5, meaning: "Labor market weakening", marketImpact: "Fed may ease, recession watch" },
      { label: "Recession", min: 6.5, max: 8.0, meaning: "Significant job losses", marketImpact: "Fed cutting, risk-off, quality focus" },
      { label: "Crisis", min: 8.0, max: null, meaning: "Severe economic distress", marketImpact: "Defensive positioning, policy response expected" },
    ],
    keyLevels: [
      { level: 4.0, significance: "Rough estimate of 'full employment'" },
      { level: 5.5, significance: "Sahm Rule trigger zone (0.5% rise from low)" },
    ],
    affectedAssets: ["Consumer discretionary", "Cyclicals", "Defensive sectors (inverse)"],
  },
  {
    id: "initial-claims",
    name: "Initial Jobless Claims",
    fredCode: "ICSA",
    category: "employment",
    unit: "thousands",
    frequency: "weekly",
    description: "Number of people filing for unemployment insurance for the first time each week.",
    whyItMatters: "The most timely labor market indicator (weekly!). Rising claims = companies laying off = recession early warning. Very low claims = tight labor market.",
    ranges: [
      { label: "Very Tight", min: null, max: 220, meaning: "Extremely strong labor market", marketImpact: "Wage pressure, Fed hawkish" },
      { label: "Healthy", min: 220, max: 280, meaning: "Normal, sustainable levels", marketImpact: "Neutral, watch the trend" },
      { label: "Softening", min: 280, max: 350, meaning: "Labor market cooling", marketImpact: "Fed may pause/cut, mixed signals" },
      { label: "Concerning", min: 350, max: 450, meaning: "Significant layoffs", marketImpact: "Recession risk rising" },
      { label: "Recession", min: 450, max: null, meaning: "Widespread job losses", marketImpact: "Risk-off, Fed emergency mode" },
    ],
    affectedAssets: ["Cyclicals", "Consumer discretionary", "Staffing companies"],
  },

  // === GROWTH ===
  {
    id: "industrial-production",
    name: "Industrial Production (YoY)",
    fredCode: "INDPRO",
    category: "growth",
    unit: "%",
    frequency: "monthly",
    description: "Year-over-year change in industrial production output. Covers manufacturing, mining, and utilities.",
    whyItMatters: "Direct measure of manufacturing activity (not a survey). Negative YoY = contraction. Strong correlation with earnings for industrial companies and broader economic cycles.",
    ranges: [
      { label: "Contraction", min: null, max: -2, meaning: "Industrial recession", marketImpact: "Risk-off, industrials suffer" },
      { label: "Weakness", min: -2, max: 0, meaning: "Slowing/flat production", marketImpact: "Caution, watch for recovery" },
      { label: "Moderate Growth", min: 0, max: 3, meaning: "Healthy expansion", marketImpact: "Generally supportive" },
      { label: "Strong Growth", min: 3, max: 6, meaning: "Robust industrial activity", marketImpact: "Bullish for industrials, cyclicals" },
      { label: "Overheating", min: 6, max: null, meaning: "Capacity constraints likely", marketImpact: "Inflation risk, supply chain stress" },
    ],
    keyLevels: [
      { level: 0, significance: "Growth/contraction threshold" },
      { level: -5, significance: "Recession-level decline" },
    ],
    affectedAssets: ["Industrials", "Materials", "Cyclicals", "Transports"],
  },

  // === CREDIT ===
  {
    id: "hy-spread",
    name: "High Yield Credit Spread",
    fredCode: "BAMLH0A0HYM2",
    category: "rates",
    unit: "bps",
    frequency: "daily",
    description: "The extra yield investors demand to hold high-yield (junk) bonds over Treasuries. Measures credit risk appetite.",
    whyItMatters: "Credit spreads are the 'canary in the coal mine' for financial stress. Widening spreads = investors worried about defaults = risk-off. Tight spreads = complacency or strong economy.",
    ranges: [
      { label: "Very Tight", min: null, max: 300, meaning: "High risk appetite/complacency", marketImpact: "Risk-on, but watch for reversal" },
      { label: "Normal", min: 300, max: 450, meaning: "Balanced risk assessment", marketImpact: "Healthy credit conditions" },
      { label: "Elevated", min: 450, max: 600, meaning: "Increased caution", marketImpact: "Credit concerns emerging" },
      { label: "Stressed", min: 600, max: 800, meaning: "Significant credit risk", marketImpact: "Risk-off, quality flight" },
      { label: "Crisis", min: 800, max: null, meaning: "Credit market dysfunction", marketImpact: "Defensive only, Fed intervention likely" },
    ],
    keyLevels: [
      { level: 500, significance: "Stress threshold" },
      { level: 800, significance: "Crisis levels (2008, 2020)" },
    ],
    affectedAssets: ["High yield bonds", "Leveraged companies", "Banks", "Risk assets broadly"],
  },
  {
    id: "ig-spread",
    name: "Investment Grade Credit Spread",
    fredCode: "BAMLC0A0CM",
    category: "rates",
    unit: "bps",
    frequency: "daily",
    description: "The extra yield investors demand to hold investment-grade corporate bonds over Treasuries. Measures stress in high-quality credit.",
    whyItMatters: "IG spreads widen when even quality companies face funding stress. Unlike HY, IG stress signals systemic problems — when blue-chip companies can't borrow cheaply, something is very wrong.",
    ranges: [
      { label: "Very Tight", min: null, max: 80, meaning: "Extremely low risk perception", marketImpact: "Risk-on, potential complacency" },
      { label: "Normal", min: 80, max: 120, meaning: "Healthy credit conditions", marketImpact: "Balanced risk appetite" },
      { label: "Elevated", min: 120, max: 180, meaning: "Rising credit concerns", marketImpact: "Quality companies face higher borrowing costs" },
      { label: "Stressed", min: 180, max: 250, meaning: "Significant credit stress", marketImpact: "Risk-off, flight to quality" },
      { label: "Crisis", min: 250, max: null, meaning: "Credit market dysfunction", marketImpact: "Fed intervention likely, recession signal" },
    ],
    keyLevels: [
      { level: 150, significance: "Stress emerging threshold" },
      { level: 200, significance: "Crisis watch level" },
      { level: 300, significance: "2008/2020 crisis peaks" },
    ],
    affectedAssets: ["Investment grade bonds", "Quality corporates", "Banks", "Broad equity market"],
  },

  // === FX RATES ===
  {
    id: "usdjpy",
    name: "USD/JPY",
    fredCode: "DEXJPUS",
    category: "fx",
    unit: "",
    frequency: "daily",
    description: "US Dollar to Japanese Yen exchange rate. Key currency pair reflecting relative monetary policy and risk appetite.",
    whyItMatters: "USD/JPY is a 'risk barometer' - rises during risk-on (Yen weakens) and falls during risk-off (Yen strengthens). Also critical for carry trade dynamics where investors borrow cheap Yen to invest in higher-yielding USD assets.",
    ranges: [
      { label: "Yen Strength", min: null, max: 120, meaning: "Strong Yen, risk-off or BoJ tightening", marketImpact: "Japanese exporters hurt, carry trades unwinding" },
      { label: "Balanced", min: 120, max: 140, meaning: "Historical normal range", marketImpact: "Stable environment for cross-border flows" },
      { label: "Yen Weakness", min: 140, max: 155, meaning: "Weak Yen, divergent monetary policy", marketImpact: "Carry trades attractive, Japanese imports expensive" },
      { label: "Extreme Weakness", min: 155, max: null, meaning: "BoJ intervention risk", marketImpact: "Watch for BoJ action, volatility risk" },
    ],
    keyLevels: [
      { level: 150, significance: "Psychological level, past intervention zone" },
      { level: 160, significance: "Multi-decade high, intervention highly likely" },
    ],
    affectedAssets: ["Japanese exporters", "Carry trades", "EM currencies", "US multinationals"],
  },

  {
    id: "dxy",
    name: "US Dollar Index (DXY)",
    fredCode: "DXY_YAHOO", // Special flag to use Yahoo Finance instead
    category: "fx",
    unit: "",
    frequency: "daily",
    description: "ICE US Dollar Index measuring USD strength against EUR (57.6%), JPY (13.6%), GBP (11.9%), CAD (9.1%), SEK (4.2%), CHF (3.6%).",
    whyItMatters: "The DXY is THE measure of USD strength. A strong dollar is a headwind for EM economies (dollar-denominated debt), commodities (priced in USD), and US multinationals (translation effects).",
    ranges: [
      { label: "Weak Dollar", min: null, max: 95, meaning: "USD weakness vs majors", marketImpact: "Tailwind for EM, commodities, US exporters" },
      { label: "Neutral", min: 95, max: 100, meaning: "Balanced conditions", marketImpact: "Mixed, fundamentals matter more" },
      { label: "Moderate Strength", min: 100, max: 105, meaning: "USD moderately strong", marketImpact: "Some pressure on EM and commodities" },
      { label: "Strong Dollar", min: 105, max: 110, meaning: "USD strength pressuring global assets", marketImpact: "Headwind for EM, commodities; supports US importers" },
      { label: "Very Strong Dollar", min: 110, max: null, meaning: "Global financial stress risk", marketImpact: "EM debt concerns, commodity crash risk" },
    ],
    keyLevels: [
      { level: 100, significance: "Psychological level, parity milestone" },
      { level: 105, significance: "Strong dollar zone begins" },
      { level: 110, significance: "2022 highs, stress levels" },
    ],
    affectedAssets: ["Emerging markets", "Commodities", "Gold (inverse)", "US multinationals"],
  },

  // === FOREIGN YIELDS (for carry trade detection) ===
  {
    id: "japan-10y",
    name: "Japan 10Y Yield",
    fredCode: "IRLTLT01JPM156N",
    category: "foreign-yields",
    unit: "%",
    frequency: "monthly",
    description: "Japanese 10-year government bond yield. Historically near zero due to BoJ yield curve control.",
    whyItMatters: "Japan's ultra-low rates make Yen the funding currency for global carry trades. When Japanese yields rise, carry trades unwind violently, causing global risk-off moves.",
    ranges: [
      { label: "YCC Zone", min: null, max: 0.5, meaning: "BoJ yield curve control active", marketImpact: "Carry trades stable, Yen funding cheap" },
      { label: "Transition", min: 0.5, max: 1.0, meaning: "BoJ loosening YCC", marketImpact: "Carry trade uncertainty, watch for Yen strength" },
      { label: "Normalization", min: 1.0, max: 2.0, meaning: "Japan normalizing policy", marketImpact: "Major carry trade unwind risk, Yen appreciation" },
      { label: "Elevated", min: 2.0, max: null, meaning: "Japan fully normalized", marketImpact: "Fundamental shift in global capital flows" },
    ],
    keyLevels: [
      { level: 0.5, significance: "Former YCC ceiling" },
      { level: 1.0, significance: "Key psychological level for normalization" },
    ],
    affectedAssets: ["Carry trades", "Japanese banks", "Global risk assets", "Yen"],
  },
  // === FISCAL INDICATORS ===
  {
    id: "debt-to-gdp",
    name: "Federal Debt/GDP",
    fredCode: "GFDEGDQ188S",
    category: "fiscal",
    unit: "%",
    frequency: "quarterly",
    description: "Total US federal public debt as a percentage of GDP. Measures government leverage relative to economic output.",
    whyItMatters: "High debt/GDP constrains fiscal flexibility and increases interest burden. Above 100%, governments often resort to financial repression (keeping rates below inflation) to inflate away debt. This is structurally bullish for gold and real assets.",
    ranges: [
      { label: "Sustainable", min: null, max: 60, meaning: "Healthy fiscal position", marketImpact: "Full policy flexibility, bonds trusted" },
      { label: "Elevated", min: 60, max: 90, meaning: "Manageable but concerning", marketImpact: "Bond vigilantes watching, fiscal space limited" },
      { label: "High", min: 90, max: 120, meaning: "Japan/Italy territory", marketImpact: "Financial repression likely, gold tailwind" },
      { label: "Extreme", min: 120, max: null, meaning: "Debt spiral risk", marketImpact: "Currency debasement, hard assets outperform" },
    ],
    keyLevels: [
      { level: 60, significance: "Maastricht Treaty limit (EU rule)" },
      { level: 100, significance: "Debt equals one year of GDP" },
      { level: 120, significance: "Financial repression threshold" },
    ],
    affectedAssets: ["Gold (positive at high levels)", "Long-term bonds (negative)", "Real assets", "Inflation hedges"],
  },
  {
    id: "deficit-to-gdp",
    name: "Federal Deficit/GDP",
    fredCode: "FYFSGDA188S",
    category: "fiscal",
    unit: "%",
    frequency: "quarterly",
    description: "Annual federal budget deficit as a percentage of GDP. Negative values indicate deficit (spending > revenue).",
    whyItMatters: "Persistent deficits add to debt pile and require financing. Large deficits outside recessions (like 6%+ in expansion) signal structural fiscal problems. Markets eventually demand higher yields or currency weakens.",
    ranges: [
      { label: "Surplus", min: 0, max: null, meaning: "Government running surplus", marketImpact: "Rare, very bullish for bonds, dollar strength" },
      { label: "Balanced", min: -2, max: 0, meaning: "Near balanced budget", marketImpact: "Healthy fiscal dynamics" },
      { label: "Moderate Deficit", min: -4, max: -2, meaning: "Typical expansion deficit", marketImpact: "Sustainable, normal fiscal stimulus" },
      { label: "Large Deficit", min: -6, max: -4, meaning: "Elevated spending/weak revenue", marketImpact: "Inflation risk, bond supply concerns" },
      { label: "Crisis Deficit", min: null, max: -6, meaning: "Recession or war-time spending", marketImpact: "Debt monetization risk, gold/inflation hedges" },
    ],
    keyLevels: [
      { level: 0, significance: "Balanced budget" },
      { level: -3, significance: "EU Maastricht limit" },
      { level: -6, significance: "Structural crisis threshold" },
    ],
    affectedAssets: ["Treasury supply (more deficits = more bonds)", "Gold", "Inflation expectations", "Dollar"],
  },

  // === LIQUIDITY / FED BALANCE SHEET ===
  {
    id: "fed-tbills",
    name: "Fed T-Bill Holdings",
    fredCode: "WSHOBL",
    category: "liquidity",
    unit: "$B",
    frequency: "weekly",
    description: "Treasury bills (short-term debt) held by the Federal Reserve. A stealth liquidity injection tool.",
    whyItMatters: "Rapid T-bill accumulation signals funding market stress or Treasury dysfunction. Every spike has preceded or accompanied crisis: Sep 2019 repo crisis, Mar 2020 COVID. Current 2026 spike exceeds COVID peak with no declared emergency — someone is in trouble.",
    ranges: [
      { label: "Normal", min: null, max: 100, meaning: "Routine balance sheet management", marketImpact: "No stress signal" },
      { label: "Elevated", min: 100, max: 250, meaning: "Above-normal T-bill holdings", marketImpact: "Watch for funding stress signals" },
      { label: "High", min: 250, max: 325, meaning: "COVID-era peak territory", marketImpact: "Significant liquidity injection underway" },
      { label: "Extreme", min: 325, max: null, meaning: "Above COVID peak — unprecedented", marketImpact: "Major stress signal, stealth QE underway" },
    ],
    keyLevels: [
      { level: 325, significance: "March 2020 COVID peak" },
      { level: 344, significance: "Current 2026 level — exceeds COVID" },
    ],
    affectedAssets: ["Short-term rates", "Money markets", "Risk assets (hidden liquidity support)"],
  },
  {
    id: "reverse-repo",
    name: "Reverse Repo (ON RRP)",
    fredCode: "RRPONTSYD",
    category: "liquidity",
    unit: "$B",
    frequency: "daily",
    description: "Cash parked at the Fed by money market funds via overnight reverse repos. Acts as a liquidity floor.",
    whyItMatters: "When RRP is high, excess liquidity is sitting idle. When it drains rapidly, liquidity is being absorbed elsewhere (Treasuries, bank deposits). A drain toward zero signals tightening conditions.",
    ranges: [
      { label: "Depleted", min: null, max: 200, meaning: "RRP buffer exhausted", marketImpact: "Tightening bite intensifies, watch money markets" },
      { label: "Low", min: 200, max: 500, meaning: "Limited excess liquidity", marketImpact: "System running lean, funding rates may rise" },
      { label: "Moderate", min: 500, max: 1500, meaning: "Healthy liquidity buffer", marketImpact: "System stable, QT can continue" },
      { label: "High", min: 1500, max: null, meaning: "Excess liquidity abundant", marketImpact: "Fed can drain without stress" },
    ],
    keyLevels: [
      { level: 0, significance: "Buffer fully drained — funding stress risk" },
      { level: 500, significance: "Minimal buffer threshold" },
      { level: 2500, significance: "2022-23 peak excess liquidity" },
    ],
    affectedAssets: ["Money market rates", "T-bills", "Bank reserves", "Risk assets (liquidity-sensitive)"],
  },
  {
    id: "bank-reserves",
    name: "Bank Reserve Balances",
    fredCode: "WRESBAL",
    category: "liquidity",
    unit: "$T",
    frequency: "weekly",
    description: "Reserves held by depository institutions at Federal Reserve Banks. The core of the banking system's liquidity.",
    whyItMatters: "Below $3T, banks start competing for reserves, causing funding stress. The 2019 repo spike occurred near $1.5T. Fed targets 'ample reserves' regime — below threshold triggers intervention.",
    ranges: [
      { label: "Scarce", min: null, max: 2.5, meaning: "Below comfortable level", marketImpact: "Repo stress risk, Fed likely to intervene" },
      { label: "Adequate", min: 2.5, max: 3.0, meaning: "Minimum comfort zone", marketImpact: "QT may need to slow or stop" },
      { label: "Ample", min: 3.0, max: 3.5, meaning: "Fed's target regime", marketImpact: "System functioning normally" },
      { label: "Abundant", min: 3.5, max: null, meaning: "Excess reserves", marketImpact: "Room for QT to continue" },
    ],
    keyLevels: [
      { level: 1.5, significance: "Sep 2019 repo crisis level" },
      { level: 3.0, significance: "Fed's approximate 'ample' threshold" },
    ],
    affectedAssets: ["Fed funds rate", "SOFR", "Repo markets", "Bank stocks"],
  },
  {
    id: "sofr",
    name: "SOFR (Secured Overnight Financing Rate)",
    fredCode: "SOFR",
    category: "liquidity",
    unit: "%",
    frequency: "daily",
    description: "The benchmark rate for overnight secured lending (repo), replaced LIBOR. Reflects actual funding costs in money markets.",
    whyItMatters: "SOFR spikes above Fed Funds indicate repo market stress — demand for overnight cash exceeds supply. The 2019 repo crisis saw SOFR spike to 5.25% (300bps above target). Watch the spread to Fed Funds.",
    ranges: [
      { label: "Below Target", min: null, max: -0.05, meaning: "SOFR below Fed Funds (unusual)", marketImpact: "Excess liquidity, possible market distortion" },
      { label: "At Target", min: -0.05, max: 0.1, meaning: "SOFR tracking Fed Funds", marketImpact: "Normal market functioning" },
      { label: "Elevated", min: 0.1, max: 0.25, meaning: "Slight funding pressure", marketImpact: "Watch for developing stress" },
      { label: "Stressed", min: 0.25, max: null, meaning: "Significant spread to Fed Funds", marketImpact: "Funding market stress, intervention likely" },
    ],
    keyLevels: [
      { level: 0, significance: "SOFR = Fed Funds (normal)" },
      { level: 0.25, significance: "Stress threshold — watch closely" },
      { level: 3.0, significance: "2019 repo crisis spike (300bps above target)" },
    ],
    affectedAssets: ["Money markets", "Floating-rate loans (SOFR-indexed)", "Bank funding costs", "Short-duration bonds"],
  },
];

// Helper to get current interpretation
export function interpretValue(indicator: MacroIndicator, value: number): {
  label: string;
  meaning: string;
  marketImpact: string;
} | null {
  for (const range of indicator.ranges) {
    const aboveMin = range.min === null || value >= range.min;
    const belowMax = range.max === null || value < range.max;
    if (aboveMin && belowMax) {
      return {
        label: range.label,
        meaning: range.meaning,
        marketImpact: range.marketImpact,
      };
    }
  }
  return null;
}

// Calculate percentile vs historical data
export function calculatePercentile(value: number, historicalValues: number[]): number {
  const sorted = [...historicalValues].sort((a, b) => a - b);
  const below = sorted.filter(v => v < value).length;
  return Math.round((below / sorted.length) * 100);
}
