// ── Thesis Composite Scoring ─────────────────────────────────────────

import type { EvaluatedSignal, CompositeRating, SignalCategory } from "./types";

/** Category weights for composite score */
const CATEGORY_WEIGHTS: Record<SignalCategory, number> = {
  primary: 0.5,
  secondary: 0.3,
  sentiment: 0.2,
  warning: 0, // Warning signals excluded from composite scoring
};

/**
 * Compute weighted composite score (0-100).
 * Within each category, signals are weighted by their individual weight.
 * Categories are then combined using CATEGORY_WEIGHTS.
 */
export function computeCompositeScore(signals: EvaluatedSignal[]): number {
  const categories: Record<SignalCategory, EvaluatedSignal[]> = {
    primary: [],
    secondary: [],
    sentiment: [],
    warning: [],
  };

  for (const s of signals) {
    categories[s.category].push(s);
  }

  let totalScore = 0;
  let totalWeight = 0;

  for (const [cat, catSignals] of Object.entries(categories) as [SignalCategory, EvaluatedSignal[]][]) {
    if (catSignals.length === 0) continue;

    const catWeight = CATEGORY_WEIGHTS[cat];
    const sumWeighted = catSignals.reduce((acc, s) => acc + s.score * s.weight, 0);
    const sumWeights = catSignals.reduce((acc, s) => acc + s.weight, 0);
    const catScore = sumWeights > 0 ? sumWeighted / sumWeights : 50;

    totalScore += catScore * catWeight;
    totalWeight += catWeight;
  }

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;
}

/**
 * Map composite score to a human-readable rating.
 */
export function scoreToRating(score: number): CompositeRating {
  if (score >= 80) return "strong-buy";
  if (score >= 60) return "buy";
  if (score >= 40) return "neutral";
  if (score >= 25) return "caution";
  return "avoid";
}
