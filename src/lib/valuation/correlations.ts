/**
 * Correlation Calculation Library
 * 
 * Calculates pairwise correlations between assets and compares
 * them to historical baselines to detect regime changes.
 */

export type CorrelationAsset = "SPY" | "GLD" | "BTC" | "TLT" | "DXY";

export interface CorrelationMatrix {
  [asset: string]: {
    [asset: string]: number;
  };
}

export interface CorrelationAlert {
  pair: string;
  correlation: number;
  historical: number;
  status: "elevated" | "depressed" | "normal";
}

export interface CorrelationsResponse {
  matrix: CorrelationMatrix;
  alerts: CorrelationAlert[];
  period: string;
  updatedAt: string;
  status: "live" | "partial" | "error";
  error?: string;
}

// Historical baseline correlations (based on 2015-2024 data)
// These serve as "normal" reference points for deviation detection
export const HISTORICAL_CORRELATIONS: Record<string, number> = {
  "SPY-GLD": -0.05,   // Stocks vs Gold: slightly negative (diversification)
  "SPY-BTC": 0.35,    // Stocks vs Bitcoin: moderate positive (risk-on correlation)
  "SPY-TLT": -0.35,   // Stocks vs Bonds: negative (classic 60/40 relationship)
  "SPY-DXY": -0.15,   // Stocks vs Dollar: slight negative
  "GLD-BTC": 0.15,    // Gold vs Bitcoin: slight positive (both "alternative")
  "GLD-TLT": 0.30,    // Gold vs Bonds: moderate positive (both benefit from lower rates)
  "GLD-DXY": -0.45,   // Gold vs Dollar: strong negative (inverse relationship)
  "BTC-TLT": -0.10,   // Bitcoin vs Bonds: slight negative
  "BTC-DXY": -0.25,   // Bitcoin vs Dollar: negative
  "TLT-DXY": -0.20,   // Bonds vs Dollar: slight negative
};

// Threshold for flagging unusual correlations (absolute deviation from historical)
const ALERT_THRESHOLD = 0.25;

/**
 * Calculate daily returns from a price series
 * @param prices Array of closing prices (oldest first)
 * @returns Array of daily returns as decimals
 */
export function calculateDailyReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const curr = prices[i];
    if (prev > 0) {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 * @param x First array of values
 * @param y Second array of values
 * @returns Correlation coefficient (-1 to 1)
 */
export function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  // Take the same length
  const xSlice = x.slice(-n);
  const ySlice = y.slice(-n);

  // Calculate means
  const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
  const yMean = ySlice.reduce((a, b) => a + b, 0) / n;

  // Calculate covariance and standard deviations
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = xSlice[i] - xMean;
    const yDiff = ySlice[i] - yMean;
    covariance += xDiff * yDiff;
    xVariance += xDiff * xDiff;
    yVariance += yDiff * yDiff;
  }

  const denominator = Math.sqrt(xVariance * yVariance);
  if (denominator === 0) return 0;

  return covariance / denominator;
}

/**
 * Build a full correlation matrix from asset return series
 * @param returns Object mapping asset symbols to their daily returns
 * @returns Correlation matrix
 */
export function buildCorrelationMatrix(
  returns: Record<CorrelationAsset, number[]>
): CorrelationMatrix {
  const assets = Object.keys(returns) as CorrelationAsset[];
  const matrix: CorrelationMatrix = {};

  for (const assetA of assets) {
    matrix[assetA] = {};
    for (const assetB of assets) {
      if (assetA === assetB) {
        matrix[assetA][assetB] = 1.0;
      } else {
        const corr = calculateCorrelation(returns[assetA], returns[assetB]);
        matrix[assetA][assetB] = Math.round(corr * 100) / 100;
      }
    }
  }

  return matrix;
}

/**
 * Generate alerts for correlations that deviate significantly from historical norms
 * @param matrix Current correlation matrix
 * @returns Array of correlation alerts
 */
export function generateCorrelationAlerts(matrix: CorrelationMatrix): CorrelationAlert[] {
  const alerts: CorrelationAlert[] = [];
  const assets = Object.keys(matrix) as CorrelationAsset[];

  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      const assetA = assets[i];
      const assetB = assets[j];
      const pairKey = `${assetA}-${assetB}`;
      
      const historical = HISTORICAL_CORRELATIONS[pairKey];
      if (historical === undefined) continue;

      const current = matrix[assetA]?.[assetB] ?? 0;
      const deviation = current - historical;

      if (Math.abs(deviation) >= ALERT_THRESHOLD) {
        alerts.push({
          pair: pairKey,
          correlation: current,
          historical,
          status: deviation > 0 ? "elevated" : "depressed",
        });
      }
    }
  }

  // Sort by absolute deviation (most unusual first)
  alerts.sort((a, b) => 
    Math.abs(b.correlation - b.historical) - Math.abs(a.correlation - a.historical)
  );

  return alerts;
}

/**
 * Get human-readable interpretation of correlation status
 */
export function getCorrelationInterpretation(pair: string, status: "elevated" | "depressed" | "normal"): string {
  const interpretations: Record<string, Record<string, string>> = {
    "SPY-BTC": {
      elevated: "Risk assets moving together more than usual",
      depressed: "Bitcoin decoupling from equities",
    },
    "SPY-TLT": {
      elevated: "Stocks and bonds correlating (unusual - both rallying or selling)",
      depressed: "Strong risk-off rotation into bonds",
    },
    "GLD-DXY": {
      elevated: "Gold/Dollar inverse breaking down",
      depressed: "Strong dollar headwind for gold",
    },
    "SPY-GLD": {
      elevated: "Everything-rally in progress",
      depressed: "Strong rotation from stocks to gold",
    },
  };

  return interpretations[pair]?.[status] ?? `${pair} correlation is ${status}`;
}
