export type ProjectStatus = "backlog" | "in_progress" | "blocked" | "done";
export type BuildStatus = "pass" | "fail" | "unknown";
export type ProjectPhase = "idea" | "research" | "build" | "launch" | "grow" | "iterate" | "maintain";
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
  content: string;
  report_type: string;
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
