// ── Thesis Engine Types ───────────────────────────────────────────────

export type SignalRating = "strong-bullish" | "bullish" | "neutral" | "bearish" | "strong-bearish";
export type SignalCategory = "primary" | "secondary" | "sentiment" | "warning";
export type CompositeRating = "strong-buy" | "buy" | "neutral" | "caution" | "avoid";

export type SignalSourceType = "fred" | "fred_yoy" | "yahoo" | "cftc" | "derived" | "manual";

export interface SignalSource {
  type: SignalSourceType;
  /** FRED series ID, Yahoo ticker, CFTC commodity, or derived key */
  key: string;
}

export interface ThesisSignalDefinition {
  id: string;
  name: string;
  category: SignalCategory;
  source: SignalSource;
  /** "below" = lower values are bullish, "above" = higher values are bullish */
  bullishDirection: "below" | "above";
  /** Thresholds for rating: [strong-bullish, bullish, neutral, bearish] boundaries */
  thresholds: number[];
  /** Weight for composite scoring (higher = more important) */
  weight: number;
  /** Short detail string explaining what this signal measures */
  detail: string;
  /** Unit for display (e.g., "%", "bps", "T", "%ile") */
  unit: string;
}

export interface EvaluatedSignal {
  id: string;
  name: string;
  category: SignalCategory;
  currentValue: number | null;
  /** Previous value for trend display (e.g., prior month FRED, previous close Yahoo) */
  previousValue: number | null;
  rating: SignalRating;
  /** Raw score 0-100 for this signal */
  score: number;
  /** score * weight */
  weightedScore: number;
  weight: number;
  detail: string;
  unit: string;
  /** Threshold boundaries [t0, t1, t2, t3] from signal definition */
  thresholds: number[];
  /** "below" = lower values are bullish, "above" = higher values are bullish */
  bullishDirection: "below" | "above";
}

export interface ThesisSignalSnapshot {
  signals: EvaluatedSignal[];
  compositeScore: number; // 0-100
  compositeRating: CompositeRating;
  evaluatedAt: string;
}

export type PreCommitmentOperator = "lt" | "gt" | "lte" | "gte" | "eq";

export interface PreCommitmentCondition {
  signalId: string;
  label: string;
  operator: PreCommitmentOperator;
  value: number;
  /** Optional: must persist for N quarters */
  durationQuarters?: number;
}

export interface PreCommitmentRule {
  type: "entry" | "change" | "review";
  label: string;
  /** "all" = every condition must be met, "any" = at least one */
  logic: "all" | "any";
  conditions: PreCommitmentCondition[];
}

export interface ConditionEvaluation {
  label: string;
  signalId: string;
  met: boolean;
  currentValue: number | null;
  threshold: number;
  operator: PreCommitmentOperator;
}

export interface RuleEvaluation {
  type: "entry" | "change" | "review";
  label: string;
  met: boolean;
  metCount: number;
  totalCount: number;
  conditions: ConditionEvaluation[];
}

export interface PreCommitmentEvaluation {
  entryMet: boolean;
  thesisChangeMet: boolean;
  reviewTriggered: boolean;
  rules: RuleEvaluation[];
}

export interface ThesisAssetConfig {
  asset: string;
  name: string;
  signalDefinitions: ThesisSignalDefinition[];
  entryConditions: PreCommitmentRule;
  thesisChangeConditions: PreCommitmentRule;
  reviewTriggers: PreCommitmentRule;
}
