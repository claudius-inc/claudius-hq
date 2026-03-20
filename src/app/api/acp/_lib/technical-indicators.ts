/**
 * Technical indicator calculations for trading signals
 * RSI, MACD, SMA, EMA, Bollinger Bands, ATR
 */

// ===== Simple Moving Average =====
export function calculateSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// ===== Exponential Moving Average =====
export function calculateEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  
  // Start with SMA for first period
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Calculate EMA for remaining values
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  return ema;
}

// ===== RSI (Relative Strength Index) =====
export function calculateRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;
  
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  
  // Use recent changes only
  const recentChanges = changes.slice(-period);
  
  let gains = 0;
  let losses = 0;
  
  for (const change of recentChanges) {
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

export function getRSISignal(rsi: number): "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL" {
  if (rsi >= 70) return "OVERBOUGHT";
  if (rsi <= 30) return "OVERSOLD";
  return "NEUTRAL";
}

// ===== MACD (Moving Average Convergence Divergence) =====
export interface MACDResult {
  macd_line: number;
  signal_line: number;
  histogram: number;
  crossover: "BULLISH" | "BEARISH" | "NONE";
}

export function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult | null {
  if (closes.length < slowPeriod + signalPeriod) return null;
  
  // Calculate MACD line for multiple periods to get signal line
  const macdValues: number[] = [];
  
  for (let i = slowPeriod; i <= closes.length; i++) {
    const slice = closes.slice(0, i);
    const ema12 = calculateEMA(slice, fastPeriod);
    const ema26 = calculateEMA(slice, slowPeriod);
    if (ema12 !== null && ema26 !== null) {
      macdValues.push(ema12 - ema26);
    }
  }
  
  if (macdValues.length < signalPeriod) return null;
  
  const currentMACD = macdValues[macdValues.length - 1];
  const signalLine = calculateEMA(macdValues, signalPeriod);
  
  if (signalLine === null) return null;
  
  const histogram = currentMACD - signalLine;
  
  // Determine crossover by comparing current and previous positions
  let crossover: "BULLISH" | "BEARISH" | "NONE" = "NONE";
  if (macdValues.length >= 2) {
    const prevMACD = macdValues[macdValues.length - 2];
    const prevSignal = calculateEMA(macdValues.slice(0, -1), signalPeriod);
    
    if (prevSignal !== null) {
      const prevHistogram = prevMACD - prevSignal;
      // Crossover happened if histogram changed sign
      if (prevHistogram < 0 && histogram > 0) crossover = "BULLISH";
      if (prevHistogram > 0 && histogram < 0) crossover = "BEARISH";
    }
  }
  
  return {
    macd_line: Math.round(currentMACD * 100) / 100,
    signal_line: Math.round(signalLine * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
    crossover,
  };
}

// ===== Bollinger Bands =====
export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  position: "ABOVE_UPPER" | "NEAR_UPPER" | "MIDDLE" | "NEAR_LOWER" | "BELOW_LOWER";
  squeeze: boolean;
}

export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDev: number = 2
): BollingerBands | null {
  if (closes.length < period) return null;
  
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  
  // Calculate standard deviation
  const squaredDiffs = slice.map(v => Math.pow(v - middle, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(variance);
  
  const upper = middle + stdDev * sd;
  const lower = middle - stdDev * sd;
  
  const currentPrice = closes[closes.length - 1];
  
  // Determine position
  let position: BollingerBands["position"];
  if (currentPrice > upper) position = "ABOVE_UPPER";
  else if (currentPrice > middle + (upper - middle) * 0.7) position = "NEAR_UPPER";
  else if (currentPrice < lower) position = "BELOW_LOWER";
  else if (currentPrice < middle - (middle - lower) * 0.7) position = "NEAR_LOWER";
  else position = "MIDDLE";
  
  // Squeeze detection (bands narrow = low volatility)
  const bandWidth = (upper - lower) / middle;
  const squeeze = bandWidth < 0.04; // 4% band width is considered squeeze
  
  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    position,
    squeeze,
  };
}

// ===== Average True Range (ATR) =====
export interface OHLCData {
  high: number;
  low: number;
  close: number;
}

export function calculateATR(data: OHLCData[], period: number = 14): number | null {
  if (data.length < period + 1) return null;
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // Use EMA for ATR
  const recentTR = trueRanges.slice(-period);
  const atr = recentTR.reduce((a, b) => a + b, 0) / period;
  
  return Math.round(atr * 100) / 100;
}

// ===== Volume Analysis =====
export interface VolumeAnalysis {
  current: number;
  avg_20: number;
  ratio: number;
  trend: "INCREASING" | "DECREASING" | "STABLE";
}

export function analyzeVolume(volumes: number[]): VolumeAnalysis | null {
  if (volumes.length < 20) return null;
  
  const current = volumes[volumes.length - 1];
  const avg_20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ratio = Math.round((current / avg_20) * 100) / 100;
  
  // Trend: compare recent 5 avg to previous 5 avg
  const recent5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const prev5 = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
  
  let trend: VolumeAnalysis["trend"];
  if (recent5 > prev5 * 1.15) trend = "INCREASING";
  else if (recent5 < prev5 * 0.85) trend = "DECREASING";
  else trend = "STABLE";
  
  return {
    current: Math.round(current),
    avg_20: Math.round(avg_20),
    ratio,
    trend,
  };
}

// ===== SMAs Wrapper =====
export interface SMAResult {
  sma_20: number;
  sma_50: number;
  sma_200: number;
  price_vs_sma_20: "ABOVE" | "BELOW";
  price_vs_sma_50: "ABOVE" | "BELOW";
  price_vs_sma_200: "ABOVE" | "BELOW";
  golden_cross: boolean;
  death_cross: boolean;
}

export function calculateSMAs(closes: number[]): SMAResult | null {
  const sma_20 = calculateSMA(closes, 20);
  const sma_50 = calculateSMA(closes, 50);
  const sma_200 = calculateSMA(closes, 200);
  
  if (!sma_20 || !sma_50 || !sma_200) return null;
  
  const currentPrice = closes[closes.length - 1];
  
  return {
    sma_20: Math.round(sma_20 * 100) / 100,
    sma_50: Math.round(sma_50 * 100) / 100,
    sma_200: Math.round(sma_200 * 100) / 100,
    price_vs_sma_20: currentPrice > sma_20 ? "ABOVE" : "BELOW",
    price_vs_sma_50: currentPrice > sma_50 ? "ABOVE" : "BELOW",
    price_vs_sma_200: currentPrice > sma_200 ? "ABOVE" : "BELOW",
    golden_cross: sma_50 > sma_200,
    death_cross: sma_50 < sma_200,
  };
}

// ===== Overall Trend =====
export function determineTrend(
  rsi: number,
  macd: MACDResult,
  smas: SMAResult,
  currentPrice: number
): "BULLISH" | "BEARISH" | "NEUTRAL" {
  let bullish = 0;
  let bearish = 0;
  
  // RSI
  if (rsi > 50) bullish++;
  else if (rsi < 50) bearish++;
  
  // MACD histogram
  if (macd.histogram > 0) bullish++;
  else if (macd.histogram < 0) bearish++;
  
  // Price vs SMAs
  if (smas.price_vs_sma_20 === "ABOVE") bullish++;
  else bearish++;
  
  if (smas.price_vs_sma_50 === "ABOVE") bullish++;
  else bearish++;
  
  if (smas.price_vs_sma_200 === "ABOVE") bullish++;
  else bearish++;
  
  // Golden/Death cross
  if (smas.golden_cross) bullish++;
  if (smas.death_cross) bearish++;
  
  if (bullish >= bearish + 2) return "BULLISH";
  if (bearish >= bullish + 2) return "BEARISH";
  return "NEUTRAL";
}

// ===== Signal Generation =====
export interface SignalResult {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  strength: "STRONG" | "MODERATE" | "WEAK";
}

export interface SignalFactors {
  rsiSignal: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL";
  macdCrossover: "BULLISH" | "BEARISH" | "NONE";
  priceVsSma: { sma20: boolean; sma50: boolean; sma200: boolean };
  volumeTrend: "INCREASING" | "DECREASING" | "STABLE";
  bollingerPosition: string;
  fearGreedIndex?: number;
}

export function calculateSignal(factors: SignalFactors): SignalResult {
  let bullishPoints = 0;
  let bearishPoints = 0;
  const maxPoints = 10;
  
  // RSI (2 points max)
  if (factors.rsiSignal === "OVERSOLD") bullishPoints += 2;
  else if (factors.rsiSignal === "OVERBOUGHT") bearishPoints += 2;
  
  // MACD Crossover (2 points)
  if (factors.macdCrossover === "BULLISH") bullishPoints += 2;
  else if (factors.macdCrossover === "BEARISH") bearishPoints += 2;
  
  // Price vs SMAs (3 points total)
  if (factors.priceVsSma.sma20) bullishPoints += 1; else bearishPoints += 1;
  if (factors.priceVsSma.sma50) bullishPoints += 1; else bearishPoints += 1;
  if (factors.priceVsSma.sma200) bullishPoints += 1; else bearishPoints += 1;
  
  // Volume confirmation (1 point)
  if (factors.volumeTrend === "INCREASING") {
    if (bullishPoints > bearishPoints) bullishPoints += 1;
    else bearishPoints += 1;
  }
  
  // Bollinger position (1 point)
  if (factors.bollingerPosition === "BELOW_LOWER") bullishPoints += 1;
  else if (factors.bollingerPosition === "ABOVE_UPPER") bearishPoints += 1;
  
  // Fear & Greed contrarian (1 point)
  if (factors.fearGreedIndex !== undefined) {
    if (factors.fearGreedIndex < 25) bullishPoints += 1;
    else if (factors.fearGreedIndex > 75) bearishPoints += 1;
  }
  
  // Determine action
  const netScore = bullishPoints - bearishPoints;
  let action: "BUY" | "SELL" | "HOLD";
  
  if (netScore >= 3) action = "BUY";
  else if (netScore <= -3) action = "SELL";
  else action = "HOLD";
  
  // Confidence = how decisive the indicators are
  const dominantPoints = Math.max(bullishPoints, bearishPoints);
  const confidence = Math.round((dominantPoints / maxPoints) * 100);
  
  // Strength
  let strength: "STRONG" | "MODERATE" | "WEAK";
  if (confidence >= 70) strength = "STRONG";
  else if (confidence >= 50) strength = "MODERATE";
  else strength = "WEAK";
  
  return { action, confidence, strength };
}

// ===== Price Targets =====
export interface PriceTargets {
  support_1: number;
  support_2: number;
  resistance_1: number;
  resistance_2: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
}

export function calculatePriceTargets(
  currentPrice: number,
  bollinger: BollingerBands,
  smas: SMAResult,
  atr: number
): PriceTargets {
  return {
    support_1: Math.round(Math.min(bollinger.lower, smas.sma_20) * 100) / 100,
    support_2: Math.round(Math.min(smas.sma_50, smas.sma_200) * 100) / 100,
    resistance_1: Math.round(Math.max(bollinger.upper, smas.sma_50) * 100) / 100,
    resistance_2: Math.round(currentPrice * 1.15 * 100) / 100,
    stop_loss: Math.round((currentPrice - atr * 2) * 100) / 100,
    take_profit_1: Math.round((currentPrice + atr * 3) * 100) / 100,
    take_profit_2: Math.round((currentPrice + atr * 5) * 100) / 100,
  };
}

// ===== Reasoning Generation =====
export function generateReasoning(
  rsi: number,
  rsiSignal: string,
  macd: MACDResult,
  smas: SMAResult,
  volume: VolumeAnalysis,
  trend: string
): string[] {
  const reasons: string[] = [];
  
  // RSI
  if (rsiSignal === "OVERSOLD") {
    reasons.push(`RSI at ${rsi} indicates oversold conditions, potential bounce`);
  } else if (rsiSignal === "OVERBOUGHT") {
    reasons.push(`RSI at ${rsi} indicates overbought conditions, potential pullback`);
  } else {
    reasons.push(`RSI neutral at ${rsi}, neither overbought nor oversold`);
  }
  
  // MACD
  if (macd.crossover === "BULLISH") {
    reasons.push("MACD bullish crossover signals upward momentum");
  } else if (macd.crossover === "BEARISH") {
    reasons.push("MACD bearish crossover signals downward momentum");
  } else if (macd.histogram > 0) {
    reasons.push("MACD histogram positive, momentum intact");
  } else {
    reasons.push("MACD histogram negative, momentum weakening");
  }
  
  // SMAs
  if (smas.golden_cross) {
    reasons.push("Golden cross (SMA50 > SMA200) indicates bullish trend");
  } else if (smas.death_cross) {
    reasons.push("Death cross (SMA50 < SMA200) indicates bearish trend");
  }
  
  // Volume
  if (volume.trend === "INCREASING") {
    reasons.push(`Volume ${volume.ratio}x average confirms current move`);
  } else if (volume.trend === "DECREASING") {
    reasons.push(`Volume below average suggests indecision`);
  }
  
  return reasons;
}
