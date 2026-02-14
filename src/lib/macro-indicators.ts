// Macro indicator definitions with educational context

export interface MacroIndicator {
  id: string;
  name: string;
  fredCode: string;
  category: "rates" | "inflation" | "employment" | "growth" | "sentiment" | "credit";
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
    id: "2y-yield",
    name: "2-Year Treasury Yield",
    fredCode: "DGS2",
    category: "rates",
    unit: "%",
    frequency: "daily",
    description: "The yield on 2-year US government bonds. Most sensitive to expected Fed policy over the next 1-2 years.",
    whyItMatters: "The 2Y yield is the market's best guess of where the Fed Funds rate will average over the next 2 years. When it diverges from the 10Y (inversion), it signals recession expectations.",
    ranges: [
      { label: "Very Low", min: null, max: 1.5, meaning: "Market expects rate cuts or crisis", marketImpact: "Risk-on if economy stable, risk-off if recession" },
      { label: "Low", min: 1.5, max: 3.0, meaning: "Accommodative policy expected", marketImpact: "Generally supportive for risk assets" },
      { label: "Moderate", min: 3.0, max: 4.5, meaning: "Policy normalization", marketImpact: "Neutral, watch the trend" },
      { label: "High", min: 4.5, max: null, meaning: "Tight policy expected to persist", marketImpact: "Headwind for duration-sensitive assets" },
    ],
    affectedAssets: ["Short-term bonds", "Floating rate instruments", "Bank NIMs"],
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
  
  // === INFLATION ===
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
    id: "pmi-manufacturing",
    name: "ISM Manufacturing PMI",
    fredCode: "MANEMP", // Note: ISM data not directly on FRED, may need alternative source
    category: "growth",
    unit: "index",
    frequency: "monthly",
    description: "Purchasing Managers' Index for manufacturing. Based on surveys of supply chain managers about orders, production, employment.",
    whyItMatters: "Leading indicator of economic activity. Above 50 = expansion, below 50 = contraction. Manufacturing often leads the broader economy by 3-6 months.",
    ranges: [
      { label: "Deep Contraction", min: null, max: 45, meaning: "Severe manufacturing recession", marketImpact: "Risk-off, industrials suffer" },
      { label: "Contraction", min: 45, max: 50, meaning: "Manufacturing shrinking", marketImpact: "Caution, watch for bottoming" },
      { label: "Expansion", min: 50, max: 55, meaning: "Modest growth", marketImpact: "Generally supportive" },
      { label: "Strong Expansion", min: 55, max: 60, meaning: "Robust manufacturing growth", marketImpact: "Bullish for industrials, cyclicals" },
      { label: "Overheating", min: 60, max: null, meaning: "Supply constraints likely", marketImpact: "Inflation risk, capacity concerns" },
    ],
    keyLevels: [
      { level: 50, significance: "Expansion/contraction threshold" },
      { level: 45, significance: "Often correlates with recession" },
    ],
    affectedAssets: ["Industrials", "Materials", "Cyclicals", "Transports"],
  },

  // === CREDIT ===
  {
    id: "hy-spread",
    name: "High Yield Credit Spread",
    fredCode: "BAMLH0A0HYM2",
    category: "credit",
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
