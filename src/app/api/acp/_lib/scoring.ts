/**
 * Scoring calculations for Stock Scan and Alt Picks
 * 
 * Stock Weights: Momentum 35% + Fundamentals 35% + Technicals 30%
 * Alt Weights: Momentum 50% + Volume 25% + Market Cap 25%
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StockMetrics {
  // Price data
  lastPrice: number;
  marketCap: number;
  
  // Momentum
  priceChange1m: number | null;
  priceChange3m: number | null;
  priceChange6m: number | null;
  relativeStrength: number | null;
  
  // Fundamentals
  peRatio: number | null;
  pbRatio: number | null;
  roe: number | null;
  revenueGrowthYoY: number | null;
  profitMargin: number | null;
  
  // Technicals
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macdSignal: "bullish" | "bearish" | "neutral";
}

export interface StockScores {
  momentum: number;      // 0-10
  fundamentals: number;  // 0-10
  technicals: number;    // 0-10
  composite: number;     // 0-10
}

export interface AltcoinMetrics {
  priceChange24h: number;
  priceChange7d: number;
  priceChange30d: number;
  athChange: number;
  volume24h: number;
  marketCap: number;
  marketCapRank: number;
  volumeChange24h?: number;
  fullyDilutedValuation: number | null;
}

export interface AltcoinScores {
  momentum: number;     // 0-10
  volume: number;       // 0-10
  marketRank: number;   // 0-10
  composite: number;    // 0-10
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Normalize a value to 0-10 scale
 */
export function normalizeScore(value: number, min: number, max: number): number {
  if (max === min) return 5;
  const normalized = ((value - min) / (max - min)) * 10;
  return Math.max(0, Math.min(10, normalized));
}

/**
 * Calculate percentile rank of a value within an array
 */
export function percentileRank(value: number, values: number[]): number {
  if (values.length === 0) return 0.5;
  const sorted = [...values].sort((a, b) => a - b);
  let rank = 0;
  for (const v of sorted) {
    if (v < value) rank++;
    else break;
  }
  return rank / sorted.length;
}

// ─── Stock Scoring ───────────────────────────────────────────────────────────

/**
 * Calculate momentum score for a stock (0-10 scale)
 * Weights: 1m 15%, 3m 30%, 6m 35%, relative strength 20%
 */
export function calculateStockMomentumScore(
  metrics: StockMetrics,
  universe: {
    priceChanges1m: number[];
    priceChanges3m: number[];
    priceChanges6m: number[];
    relativeStrengths: number[];
  }
): number {
  let score = 0;
  let totalWeight = 0;
  
  if (metrics.priceChange1m !== null) {
    const pctRank = percentileRank(metrics.priceChange1m, universe.priceChanges1m);
    score += pctRank * 0.15;
    totalWeight += 0.15;
  }
  
  if (metrics.priceChange3m !== null) {
    const pctRank = percentileRank(metrics.priceChange3m, universe.priceChanges3m);
    score += pctRank * 0.30;
    totalWeight += 0.30;
  }
  
  if (metrics.priceChange6m !== null) {
    const pctRank = percentileRank(metrics.priceChange6m, universe.priceChanges6m);
    score += pctRank * 0.35;
    totalWeight += 0.35;
  }
  
  if (metrics.relativeStrength !== null) {
    const pctRank = percentileRank(metrics.relativeStrength, universe.relativeStrengths);
    score += pctRank * 0.20;
    totalWeight += 0.20;
  }
  
  // Normalize if we have partial data
  if (totalWeight > 0) {
    return (score / totalWeight) * 10;
  }
  return 5; // Default neutral
}

/**
 * Calculate fundamentals score for a stock (0-10 scale)
 * Lower P/E (inverted), Higher ROE, Revenue Growth, Profit Margin
 */
export function calculateStockFundamentalsScore(
  metrics: StockMetrics,
  universe: {
    peRatios: number[];
    roes: number[];
    revenueGrowths: number[];
    profitMargins: number[];
  }
): number {
  let score = 0;
  let totalWeight = 0;
  
  // P/E Ratio (lower is better, inverted percentile)
  if (metrics.peRatio !== null && metrics.peRatio > 0) {
    const pctRank = 1 - percentileRank(metrics.peRatio, universe.peRatios.filter(pe => pe > 0));
    score += pctRank * 0.20;
    totalWeight += 0.20;
  }
  
  // ROE (higher is better)
  if (metrics.roe !== null) {
    const pctRank = percentileRank(metrics.roe, universe.roes);
    score += pctRank * 0.25;
    totalWeight += 0.25;
  }
  
  // Revenue Growth (higher is better)
  if (metrics.revenueGrowthYoY !== null) {
    const pctRank = percentileRank(metrics.revenueGrowthYoY, universe.revenueGrowths);
    score += pctRank * 0.30;
    totalWeight += 0.30;
  }
  
  // Profit Margin (higher is better)
  if (metrics.profitMargin !== null) {
    const pctRank = percentileRank(metrics.profitMargin, universe.profitMargins);
    score += pctRank * 0.25;
    totalWeight += 0.25;
  }
  
  if (totalWeight > 0) {
    return (score / totalWeight) * 10;
  }
  return 5; // Default neutral
}

/**
 * Calculate technicals score for a stock (0-10 scale)
 * SMA crossover, RSI, MACD signal, price vs SMAs
 */
export function calculateStockTechnicalsScore(metrics: StockMetrics): number {
  let score = 5; // Start at neutral
  
  const { lastPrice, sma50, sma200, rsi14, macdSignal } = metrics;
  
  // Golden/Death Cross (+/-2 points)
  if (sma50 !== null && sma200 !== null) {
    if (sma50 > sma200) {
      score += 2; // Golden cross
    } else if (sma50 < sma200) {
      score -= 2; // Death cross
    }
  }
  
  // RSI analysis (+/-2 points)
  // Optimal range: 50-70 is bullish momentum
  if (rsi14 !== null) {
    if (rsi14 >= 50 && rsi14 <= 70) {
      score += 2; // Healthy bullish momentum
    } else if (rsi14 >= 30 && rsi14 < 50) {
      score += 1; // Neutral/slightly oversold
    } else if (rsi14 > 70 && rsi14 <= 80) {
      score += 1; // Strong but not extreme
    } else if (rsi14 > 80) {
      score -= 1; // Overbought
    } else if (rsi14 < 30) {
      score += 0.5; // Oversold (potential bounce)
    }
  }
  
  // MACD Signal (+/-2 points)
  if (macdSignal === "bullish") {
    score += 2;
  } else if (macdSignal === "bearish") {
    score -= 1;
  }
  
  // Price vs SMAs (+1 each)
  if (sma50 !== null && lastPrice > sma50) {
    score += 1;
  }
  if (sma200 !== null && lastPrice > sma200) {
    score += 1;
  }
  
  return Math.max(0, Math.min(10, score));
}

/**
 * Calculate composite stock score
 * Weights: Momentum 35%, Fundamentals 35%, Technicals 30%
 */
export function calculateStockCompositeScore(scores: Omit<StockScores, "composite">): number {
  return scores.momentum * 0.35 + scores.fundamentals * 0.35 + scores.technicals * 0.30;
}

/**
 * Determine SMA crossover signal
 */
export function getSMACrossoverSignal(
  sma50: number | null,
  sma200: number | null
): "golden_cross" | "death_cross" | "neutral" {
  if (sma50 === null || sma200 === null) return "neutral";
  if (sma50 > sma200) return "golden_cross";
  if (sma50 < sma200) return "death_cross";
  return "neutral";
}

// ─── Altcoin Scoring ─────────────────────────────────────────────────────────

/**
 * Calculate momentum score for altcoin (0-10 scale)
 * Weights: 24h 15%, 7d 25%, 30d 40%, ATH recovery 20%
 */
export function calculateAltMomentumScore(metrics: AltcoinMetrics): number {
  const change24h = normalizeScore(metrics.priceChange24h || 0, -20, 50);
  const change7d = normalizeScore(metrics.priceChange7d || 0, -30, 100);
  const change30d = normalizeScore(metrics.priceChange30d || 0, -50, 200);
  const athRecovery = normalizeScore(100 + (metrics.athChange || -100), 0, 100);
  
  return (change24h * 0.15) + (change7d * 0.25) + (change30d * 0.40) + (athRecovery * 0.20);
}

/**
 * Calculate volume score for altcoin (0-10 scale)
 * Based on volume/market cap ratio (healthy = 5-15%)
 */
export function calculateAltVolumeScore(metrics: AltcoinMetrics): number {
  const volMcRatio = metrics.marketCap > 0 
    ? (metrics.volume24h / metrics.marketCap) * 100 
    : 0;
  
  // Healthy ratio is 5-15%
  const volMcScore = normalizeScore(volMcRatio, 0, 20);
  
  // Volume change (if available)
  const volChange = metrics.volumeChange24h !== undefined
    ? normalizeScore(metrics.volumeChange24h, -50, 200)
    : 5;
  
  return (volMcScore * 0.60) + (volChange * 0.40);
}

/**
 * Calculate market rank score for altcoin (0-10 scale)
 * Inverse ranking: top coins score higher
 */
export function calculateAltMarketRankScore(rank: number): number {
  if (rank <= 10) return 10;
  if (rank <= 50) return 9;
  if (rank <= 100) return 8;
  if (rank <= 200) return 7;
  if (rank <= 500) return 5;
  if (rank <= 1000) return 3;
  return 1;
}

/**
 * Calculate composite altcoin score
 * Weights: Momentum 50%, Volume 25%, Market Rank 25%
 */
export function calculateAltCompositeScore(scores: Omit<AltcoinScores, "composite">): number {
  return scores.momentum * 0.50 + scores.volume * 0.25 + scores.marketRank * 0.25;
}

/**
 * Calculate FDV ratio (MC / Fully Diluted Valuation)
 * Higher ratio = more of supply is already circulating
 */
export function calculateFDVRatio(marketCap: number, fdv: number | null): number {
  if (!fdv || fdv === 0) return 1; // Assume all circulating
  return marketCap / fdv;
}

// ─── SMA/RSI/MACD Calculations ───────────────────────────────────────────────

/**
 * Calculate Simple Moving Average
 */
export function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  const recentChanges = changes.slice(-period);
  let gains = 0;
  let losses = 0;
  
  for (const change of recentChanges) {
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate MACD signal
 */
export function calculateMACDSignal(prices: number[]): "bullish" | "bearish" | "neutral" {
  if (prices.length < 26) return "neutral";
  
  // EMA calculations
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  if (ema12 === null || ema26 === null) return "neutral";
  
  const macdLine = ema12 - ema26;
  
  // Compare with previous MACD for crossover signal
  const prevPrices = prices.slice(0, -1);
  const prevEma12 = calculateEMA(prevPrices, 12);
  const prevEma26 = calculateEMA(prevPrices, 26);
  
  if (prevEma12 === null || prevEma26 === null) return "neutral";
  
  const prevMacdLine = prevEma12 - prevEma26;
  
  // Simple bullish/bearish based on direction
  if (macdLine > 0 && prevMacdLine <= 0) return "bullish";
  if (macdLine < 0 && prevMacdLine >= 0) return "bearish";
  if (macdLine > prevMacdLine) return "bullish";
  if (macdLine < prevMacdLine) return "bearish";
  
  return "neutral";
}

/**
 * Calculate Exponential Moving Average
 */
export function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

/**
 * Calculate price change percentage
 */
export function calculatePriceChange(
  currentPrice: number,
  historicalPrices: number[],
  daysAgo: number
): number | null {
  if (historicalPrices.length < daysAgo) return null;
  const oldPrice = historicalPrices[historicalPrices.length - daysAgo];
  if (oldPrice === 0) return null;
  return ((currentPrice - oldPrice) / oldPrice) * 100;
}
