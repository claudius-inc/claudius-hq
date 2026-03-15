// ── Generic Thesis Evaluation Engine ──────────────────────────────────

import type {
  ThesisSignalDefinition,
  EvaluatedSignal,
  SignalRating,
  ThesisSignalSnapshot,
  PreCommitmentRule,
  PreCommitmentEvaluation,
  RuleEvaluation,
  ConditionEvaluation,
  PreCommitmentOperator,
} from "./types";
import { computeCompositeScore, scoreToRating } from "./scoring";

/**
 * Each asset implements this interface to resolve signal values
 * from its specific data sources (FRED, Yahoo, CFTC, derived, manual).
 */
export interface SignalDataResolver {
  resolve(signalId: string, source: { type: string; key: string }): Promise<number | null>;
  /** Optional: resolve previous value for trend display */
  resolvePrevious?(signalId: string, source: { type: string; key: string }): Promise<number | null>;
}

/**
 * Rate a signal value against its thresholds.
 * Thresholds array: [strongBullish, bullish, neutral, bearish]
 * bullishDirection determines sort order.
 */
export function rateSignal(
  def: ThesisSignalDefinition,
  value: number | null,
): { rating: SignalRating; score: number } {
  if (value === null) {
    return { rating: "neutral", score: 50 };
  }

  const [t0, t1, t2, t3] = def.thresholds;

  if (def.bullishDirection === "below") {
    // Lower = more bullish (e.g., TIPS yield, DXY)
    if (value <= t0) return { rating: "strong-bullish", score: 100 };
    if (value <= t1) return { rating: "bullish", score: 75 };
    if (value <= t2) return { rating: "neutral", score: 50 };
    if (value <= t3) return { rating: "bearish", score: 25 };
    return { rating: "strong-bearish", score: 0 };
  } else {
    // Higher = more bullish (e.g., CB demand, breakeven)
    if (value >= t3) return { rating: "strong-bullish", score: 100 };
    if (value >= t2) return { rating: "bullish", score: 75 };
    if (value >= t1) return { rating: "neutral", score: 50 };
    if (value >= t0) return { rating: "bearish", score: 25 };
    return { rating: "strong-bearish", score: 0 };
  }
}

/**
 * Evaluate all signals for an asset using its resolver.
 */
export async function evaluateSignals(
  definitions: ThesisSignalDefinition[],
  resolver: SignalDataResolver,
): Promise<ThesisSignalSnapshot> {
  const signals: EvaluatedSignal[] = await Promise.all(
    definitions.map(async (def) => {
      const [value, previousValue] = await Promise.all([
        resolver.resolve(def.id, def.source),
        resolver.resolvePrevious?.(def.id, def.source) ?? Promise.resolve(null),
      ]);
      const { rating, score } = rateSignal(def, value);
      return {
        id: def.id,
        name: def.name,
        category: def.category,
        currentValue: value,
        previousValue,
        rating,
        score,
        weightedScore: score * def.weight,
        weight: def.weight,
        detail: def.detail,
        unit: def.unit,
        thresholds: def.thresholds,
        bullishDirection: def.bullishDirection,
      };
    }),
  );

  const compositeScore = computeCompositeScore(signals);
  const compositeRating = scoreToRating(compositeScore);

  return {
    signals,
    compositeScore,
    compositeRating,
    evaluatedAt: new Date().toISOString(),
  };
}

function evalOperator(op: PreCommitmentOperator, current: number, threshold: number): boolean {
  switch (op) {
    case "lt": return current < threshold;
    case "gt": return current > threshold;
    case "lte": return current <= threshold;
    case "gte": return current >= threshold;
    case "eq": return current === threshold;
  }
}

/**
 * Evaluate pre-commitment rules against evaluated signals.
 */
export function evaluatePreCommitments(
  signals: EvaluatedSignal[],
  entryRule: PreCommitmentRule,
  changeRule: PreCommitmentRule,
  reviewRule: PreCommitmentRule,
): PreCommitmentEvaluation {
  const signalMap = new Map(signals.map((s) => [s.id, s]));

  function evaluateRule(rule: PreCommitmentRule): RuleEvaluation {
    const conditions: ConditionEvaluation[] = rule.conditions.map((cond) => {
      const signal = signalMap.get(cond.signalId);
      const currentValue = signal?.currentValue ?? null;
      const met = currentValue !== null && evalOperator(cond.operator, currentValue, cond.value);
      return {
        label: cond.label,
        signalId: cond.signalId,
        met,
        currentValue,
        threshold: cond.value,
        operator: cond.operator,
      };
    });

    const metCount = conditions.filter((c) => c.met).length;
    const totalCount = conditions.length;
    const met = rule.logic === "all" ? metCount === totalCount : metCount > 0;

    return { type: rule.type, label: rule.label, met, metCount, totalCount, conditions };
  }

  const entryEval = evaluateRule(entryRule);
  const changeEval = evaluateRule(changeRule);
  const reviewEval = evaluateRule(reviewRule);

  return {
    entryMet: entryEval.met,
    thesisChangeMet: changeEval.met,
    reviewTriggered: reviewEval.met,
    rules: [entryEval, changeEval, reviewEval],
  };
}
