/**
 * Gamma Exposure (GEX) Calculator
 * 
 * Calculates dealer gamma exposure from options chains.
 * Negative GEX = dealers short gamma (bearish positioning)
 * Positive GEX = dealers long gamma (bullish positioning)
 */

// Standard normal CDF approximation (Abramowitz and Stegun)
function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// Standard normal PDF
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

interface OptionData {
  strike: number;
  openInterest: number;
  impliedVolatility: number;
  type: 'call' | 'put';
}

interface GexByStrike {
  strike: number;
  callGex: number;
  putGex: number;
  totalGex: number;
}

interface GexResult {
  symbol: string;
  spotPrice: number;
  totalGex: number;
  callGex: number;
  putGex: number;
  byStrike: GexByStrike[];
  maxPainStrike: number | null;
  flipZone: number | null; // Price where GEX flips from positive to negative
  lastUpdated: string;
}

/**
 * Calculate gamma for a single option using Black-Scholes
 * 
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiration (in years)
 * @param r - Risk-free rate
 * @param sigma - Implied volatility
 * @returns Gamma value
 */
function calculateGamma(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const gamma = normPdf(d1) / (S * sigma * Math.sqrt(T));
  
  return gamma;
}

/**
 * Calculate GEX for a list of options
 * 
 * Convention: Dealers are typically short calls and long puts (market makers)
 * - When customers buy calls, dealers sell calls → dealers short gamma on calls
 * - When customers buy puts, dealers sell puts → dealers short gamma on puts
 * 
 * Net dealer gamma = put gamma - call gamma
 * (positive = dealers benefit from stability, negative = dealers amplify moves)
 */
export function calculateGex(
  options: OptionData[],
  spotPrice: number,
  daysToExpiry: number,
  riskFreeRate: number = 0.05
): GexResult {
  const T = daysToExpiry / 365;
  const contractMultiplier = 100; // Standard options = 100 shares per contract
  
  const strikeMap = new Map<number, { callGex: number; putGex: number }>();
  
  let totalCallGex = 0;
  let totalPutGex = 0;
  
  for (const opt of options) {
    const gamma = calculateGamma(spotPrice, opt.strike, T, riskFreeRate, opt.impliedVolatility);
    // GEX = gamma * OI * 100 * spot price (dollar gamma)
    // Convention: call gamma is negative (dealers short), put gamma is positive (dealers long)
    const dollarGamma = gamma * opt.openInterest * contractMultiplier * spotPrice;
    
    if (!strikeMap.has(opt.strike)) {
      strikeMap.set(opt.strike, { callGex: 0, putGex: 0 });
    }
    
    const strikeData = strikeMap.get(opt.strike)!;
    
    if (opt.type === 'call') {
      // Dealers short calls = negative gamma exposure
      strikeData.callGex -= dollarGamma;
      totalCallGex -= dollarGamma;
    } else {
      // Dealers long puts (from selling puts) = positive gamma exposure
      strikeData.putGex += dollarGamma;
      totalPutGex += dollarGamma;
    }
  }
  
  // Convert to array and sort by strike
  const byStrike: GexByStrike[] = Array.from(strikeMap.entries())
    .map(([strike, data]) => ({
      strike,
      callGex: Math.round(data.callGex),
      putGex: Math.round(data.putGex),
      totalGex: Math.round(data.callGex + data.putGex),
    }))
    .sort((a, b) => a.strike - b.strike);
  
  // Find max pain (strike with highest total OI)
  let maxPainStrike: number | null = null;
  let maxOi = 0;
  for (const opt of options) {
    const strikeOi = options
      .filter(o => o.strike === opt.strike)
      .reduce((sum, o) => sum + o.openInterest, 0);
    if (strikeOi > maxOi) {
      maxOi = strikeOi;
      maxPainStrike = opt.strike;
    }
  }
  
  // Find flip zone (where cumulative GEX crosses zero)
  let flipZone: number | null = null;
  let cumulativeGex = 0;
  for (const s of byStrike) {
    const prevCumulative = cumulativeGex;
    cumulativeGex += s.totalGex;
    if (prevCumulative < 0 && cumulativeGex >= 0) {
      flipZone = s.strike;
      break;
    } else if (prevCumulative > 0 && cumulativeGex <= 0) {
      flipZone = s.strike;
      break;
    }
  }
  
  return {
    symbol: '',
    spotPrice,
    totalGex: Math.round(totalCallGex + totalPutGex),
    callGex: Math.round(totalCallGex),
    putGex: Math.round(totalPutGex),
    byStrike,
    maxPainStrike,
    flipZone,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Format GEX value for display (e.g., -5.4B, 2.3M)
 */
export function formatGex(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1e12) {
    return `${sign}$${(absValue / 1e12).toFixed(1)}T`;
  } else if (absValue >= 1e9) {
    return `${sign}$${(absValue / 1e9).toFixed(1)}B`;
  } else if (absValue >= 1e6) {
    return `${sign}$${(absValue / 1e6).toFixed(1)}M`;
  } else if (absValue >= 1e3) {
    return `${sign}$${(absValue / 1e3).toFixed(0)}K`;
  }
  return `${sign}$${absValue.toFixed(0)}`;
}

/**
 * Interpret GEX for market implications
 */
export function interpretGex(totalGex: number): {
  label: string;
  meaning: string;
  marketImpact: string;
  color: 'green' | 'amber' | 'red';
} {
  // GEX thresholds vary by symbol, these are rough SPY-calibrated levels
  if (totalGex > 5e9) {
    return {
      label: 'Strong Positive',
      meaning: 'Dealers long gamma, will sell rallies and buy dips',
      marketImpact: 'Volatility suppression, mean reversion likely',
      color: 'green',
    };
  } else if (totalGex > 0) {
    return {
      label: 'Positive',
      meaning: 'Dealers slightly long gamma',
      marketImpact: 'Mild stabilizing force on prices',
      color: 'green',
    };
  } else if (totalGex > -5e9) {
    return {
      label: 'Negative',
      meaning: 'Dealers short gamma, hedging amplifies moves',
      marketImpact: 'Increased volatility, trend continuation',
      color: 'amber',
    };
  } else {
    return {
      label: 'Strong Negative',
      meaning: 'Dealers heavily short gamma',
      marketImpact: 'High volatility, potential for sharp moves',
      color: 'red',
    };
  }
}
