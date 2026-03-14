/**
 * Composite scoring for the stock scanner.
 * Weights: Fundamentals 40%, Technicals 30%, Momentum 30%
 */

import type { ScanResult } from "@/app/markets/scanner/types";

export interface TechnicalMetrics {
  athWeekly: number | null;
  athMonthly: number | null;
  rvolWeekly: number | null;
  rvolMonthly: number | null;
  atrWeekly: number | null;
  rrWeekly: number | null;
}

export interface CompositeScoreBreakdown {
  fundamentalScore: number;
  technicalScore: number;
  momentumScore: number;
  compositeScore: number;
}

/**
 * Calculate the fundamentals sub-score (0-100 scale).
 * Based on existing scoring categories: growth, financial, insider.
 */
export function calculateFundamentalsScore(stock: ScanResult): number {
  // Max possible from these: growth(35) + financial(20) + insider(25) = 80
  const rawScore = stock.growth.score + stock.financial.score + stock.insider.score;
  // Normalize to 0-100
  return Math.min(100, (rawScore / 80) * 100);
}

/**
 * Calculate the technical sub-score (0-100 scale).
 * Based on existing technical category + new technical metrics.
 */
export function calculateTechnicalScore(
  stock: ScanResult,
  metrics: TechnicalMetrics
): number {
  let score = 0;

  // Base technical score (15 pts max -> 30% of 100)
  score += (stock.technical.score / 15) * 30;

  // ATR analysis: lower ATR relative to price = more stable (0-20 pts)
  // We'll use ATR% = ATR / price
  if (metrics.atrWeekly !== null) {
    // This is raw ATR, we'd need price to normalize. For now, just check it exists.
    score += 10; // Placeholder for having ATR data
  }

  // RR ratio: higher = better risk/reward (0-30 pts)
  if (metrics.rrWeekly !== null) {
    if (metrics.rrWeekly >= 3) score += 30;
    else if (metrics.rrWeekly >= 2) score += 20;
    else if (metrics.rrWeekly >= 1) score += 10;
    else score += 5;
  }

  // Near ATH penalty: if within 5% of ATH, slightly bearish signal (0 to -10 pts)
  // (This is already captured in risk penalties in the main scoring)

  return Math.min(100, score);
}

/**
 * Calculate the momentum sub-score (0-100 scale).
 * Based on RVOL and analyst sentiment.
 */
export function calculateMomentumScore(
  stock: ScanResult,
  metrics: TechnicalMetrics
): number {
  let score = 0;

  // RVOL weekly: high volume = momentum (0-40 pts)
  if (metrics.rvolWeekly !== null) {
    if (metrics.rvolWeekly >= 2.0) score += 40;
    else if (metrics.rvolWeekly >= 1.5) score += 30;
    else if (metrics.rvolWeekly >= 1.0) score += 20;
    else score += 10;
  }

  // RVOL monthly for confirmation (0-20 pts)
  if (metrics.rvolMonthly !== null) {
    if (metrics.rvolMonthly >= 1.5) score += 20;
    else if (metrics.rvolMonthly >= 1.0) score += 10;
  }

  // Analyst momentum (from stock.analyst): 10 pts max -> 40% of momentum
  score += (stock.analyst.score / 10) * 40;

  return Math.min(100, score);
}

/**
 * Calculate the composite score with weighted components.
 * Fundamentals: 40%, Technicals: 30%, Momentum: 30%
 */
export function calculateCompositeScore(
  stock: ScanResult,
  metrics: TechnicalMetrics
): CompositeScoreBreakdown {
  const fundamentalScore = calculateFundamentalsScore(stock);
  const technicalScore = calculateTechnicalScore(stock, metrics);
  const momentumScore = calculateMomentumScore(stock, metrics);

  const compositeScore = Math.round(
    fundamentalScore * 0.4 + technicalScore * 0.3 + momentumScore * 0.3
  );

  return {
    fundamentalScore: Math.round(fundamentalScore),
    technicalScore: Math.round(technicalScore),
    momentumScore: Math.round(momentumScore),
    compositeScore: Math.min(100, compositeScore),
  };
}

/**
 * Determine tier based on composite score.
 */
export function getTierFromScore(score: number): {
  tier: string;
  tierColor: string;
} {
  if (score >= 70) return { tier: "HIGH CONVICTION", tierColor: "green" };
  if (score >= 50) return { tier: "SPECULATIVE", tierColor: "yellow" };
  if (score >= 35) return { tier: "WATCHLIST", tierColor: "blue" };
  return { tier: "AVOID", tierColor: "red" };
}
