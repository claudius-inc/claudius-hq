export type ProjectStatus = "backlog" | "in_progress" | "blocked" | "done";
export type BuildStatus = "pass" | "fail" | "unknown";
export type ProjectPhase = "research" | "build" | "live";
export type EffortEstimate = "tiny" | "small" | "medium" | "large" | "huge" | "unknown";
export type IdeaPotential = "low" | "medium" | "high" | "moonshot" | "unknown";
export type IdeaStatus = "new" | "researching" | "validated" | "promoted" | "rejected";

export interface Project {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  phase: ProjectPhase;
  repo_url: string;
  deploy_url: string;
  test_count: number;
  build_status: BuildStatus;
  last_deploy_time: string;
  target_audience: string;
  action_plan: string;
  created_at: string;
  updated_at: string;
}

export interface Idea {
  id: number;
  title: string;
  description: string;
  source: string;
  market_notes: string;
  effort_estimate: EffortEstimate;
  potential: IdeaPotential;
  status: IdeaStatus;
  promoted_to_project_id: number | null;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface StockReport {
  id: number;
  ticker: string;
  title: string;
  company_name: string;
  content: string;
  report_type: string;
  related_tickers: string; // JSON array for comparison reports, e.g. '["ENPH","NXT","FSLR"]'
  created_at: string;
}

export interface ResearchPage {
  id: number;
  project_id: number;
  slug: string;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Portfolio types
export type WatchlistStatus = "watching" | "accumulating" | "graduated";

export interface WatchlistItem {
  id: number;
  ticker: string;
  target_price: number | null;
  notes: string | null;
  status: WatchlistStatus;
  added_at: string;
  updated_at: string;
  // Enriched fields (from price API)
  current_price?: number;
  price_gap_percent?: number;
}

export interface PortfolioHolding {
  id: number;
  ticker: string;
  target_allocation: number;
  cost_basis: number | null;
  shares: number | null;
  added_at: string;
  updated_at: string;
  // Enriched fields
  current_price?: number;
  market_value?: number;
  profit_loss_percent?: number;
}

export interface PortfolioReport {
  id: number;
  content: string;
  summary: string | null;
  total_tickers: number | null;
  created_at: string;
}
