/**
 * ACP Experimentation Types
 *
 * Types for tracking ACP offering experiments, metrics, price changes,
 * and competitor analysis.
 */

// ============================================================================
// Enums / Constants
// ============================================================================

export const EXPERIMENT_STATUSES = ["active", "paused", "retired"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const PRICE_EXPERIMENT_STATUSES = ["measuring", "complete", "reverted"] as const;
export type PriceExperimentStatus = (typeof PRICE_EXPERIMENT_STATUSES)[number];

// ============================================================================
// Offering Experiments — A/B tests on offerings
// ============================================================================

export interface AcpOfferingExperiment {
  id: number;
  offeringId: number | null;
  name: string;
  price: number;
  description: string | null;
  hypothesis: string | null;
  status: ExperimentStatus;
  startDate: string;
  endDate: string | null;
  resultsSummary: string | null;
  controlOfferingId: number | null;
  variantLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewAcpOfferingExperiment {
  offeringId?: number | null;
  name: string;
  price: number;
  description?: string | null;
  hypothesis?: string | null;
  status?: ExperimentStatus;
  startDate?: string;
  endDate?: string | null;
  resultsSummary?: string | null;
  controlOfferingId?: number | null;
  variantLabel?: string | null;
}

export interface UpdateAcpOfferingExperiment {
  offeringId?: number | null;
  name?: string;
  price?: number;
  description?: string | null;
  hypothesis?: string | null;
  status?: ExperimentStatus;
  endDate?: string | null;
  resultsSummary?: string | null;
  variantLabel?: string | null;
}

// ============================================================================
// Daily Offering Metrics — Time-series performance data
// ============================================================================

export interface AcpOfferingMetric {
  id: number;
  offeringId: number;
  date: string;
  jobsCount: number;
  revenue: number;
  uniqueBuyers: number;
  views: number;
  conversionRate: number | null;
  avgCompletionTimeMs: number | null;
  failureCount: number;
  createdAt: string;
}

export interface NewAcpOfferingMetric {
  offeringId: number;
  date: string;
  jobsCount?: number;
  revenue?: number;
  uniqueBuyers?: number;
  views?: number;
  conversionRate?: number | null;
  avgCompletionTimeMs?: number | null;
  failureCount?: number;
}

export interface MetricsSummary {
  totalJobs: number;
  totalRevenue: number;
  avgConversionRate: number | null;
  avgCompletionTime: number | null;
  periodStart: string;
  periodEnd: string;
}

// ============================================================================
// Price Experiments — Track price changes and impact
// ============================================================================

export interface AcpPriceExperiment {
  id: number;
  offeringId: number;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
  reason: string | null;
  jobsBefore7d: number | null;
  jobsAfter7d: number | null;
  revenueBefore7d: number | null;
  revenueAfter7d: number | null;
  revenueDelta: number | null;
  conversionBefore: number | null;
  conversionAfter: number | null;
  status: PriceExperimentStatus;
  evaluationDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface NewAcpPriceExperiment {
  offeringId: number;
  oldPrice: number;
  newPrice: number;
  reason?: string | null;
}

export interface UpdateAcpPriceExperiment {
  jobsBefore7d?: number | null;
  jobsAfter7d?: number | null;
  revenueBefore7d?: number | null;
  revenueAfter7d?: number | null;
  revenueDelta?: number | null;
  conversionBefore?: number | null;
  conversionAfter?: number | null;
  status?: PriceExperimentStatus;
  evaluationDate?: string | null;
  notes?: string | null;
}

// ============================================================================
// Competitor Tracking — Monitor competitor offerings
// ============================================================================

export interface AcpCompetitor {
  id: number;
  agentName: string;
  agentWallet: string | null;
  offeringName: string;
  price: number;
  description: string | null;
  category: string | null;
  jobsCount: number;
  totalRevenue: number | null;
  isActive: number;
  firstSeen: string;
  lastChecked: string;
  notes: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewAcpCompetitor {
  agentName: string;
  agentWallet?: string | null;
  offeringName: string;
  price: number;
  description?: string | null;
  category?: string | null;
  jobsCount?: number;
  totalRevenue?: number | null;
  isActive?: number;
  notes?: string | null;
  tags?: string | null;
}

export interface UpdateAcpCompetitor {
  agentName?: string;
  offeringName?: string;
  price?: number;
  description?: string | null;
  category?: string | null;
  jobsCount?: number;
  totalRevenue?: number | null;
  isActive?: number;
  lastChecked?: string;
  notes?: string | null;
  tags?: string | null;
}

// ============================================================================
// Competitor Snapshots — Historical tracking
// ============================================================================

export interface AcpCompetitorSnapshot {
  id: number;
  competitorId: number;
  price: number;
  jobsCount: number | null;
  description: string | null;
  snapshotAt: string;
}

export interface NewAcpCompetitorSnapshot {
  competitorId: number;
  price: number;
  jobsCount?: number | null;
  description?: string | null;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ExperimentsListResponse {
  experiments: AcpOfferingExperiment[];
  total: number;
}

export interface MetricsListResponse {
  metrics: AcpOfferingMetric[];
  summary?: MetricsSummary;
}

export interface PriceExperimentsListResponse {
  priceExperiments: AcpPriceExperiment[];
}

export interface CompetitorsListResponse {
  competitors: AcpCompetitor[];
  total: number;
}

export interface ExperimentWithMetrics extends AcpOfferingExperiment {
  metrics?: AcpOfferingMetric[];
  totalJobs?: number;
  totalRevenue?: number;
}

export interface CompetitorWithSnapshots extends AcpCompetitor {
  snapshots?: AcpCompetitorSnapshot[];
  priceHistory?: { date: string; price: number }[];
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface ExperimentAnalysis {
  experimentId: number;
  name: string;
  status: ExperimentStatus;
  daysRunning: number;
  totalJobs: number;
  totalRevenue: number;
  avgDailyJobs: number;
  avgDailyRevenue: number;
  conversionTrend: "improving" | "declining" | "stable" | "insufficient_data";
  recommendation: "continue" | "pause" | "retire" | "needs_review";
}

export interface PriceImpactAnalysis {
  priceExperimentId: number;
  priceChange: number;
  priceChangePercent: number;
  jobsDelta: number | null;
  revenueDelta: number | null;
  elasticity: number | null; // % change in demand / % change in price
  recommendation: "keep_new_price" | "revert" | "needs_more_data";
}

export interface CompetitorInsight {
  competitorId: number;
  agentName: string;
  offeringName: string;
  ourPrice: number | null;
  theirPrice: number;
  priceDifference: number | null;
  theirJobsCount: number;
  marketPosition: "cheaper" | "similar" | "premium" | "no_comparable";
  threat: "low" | "medium" | "high";
  notes: string | null;
}
