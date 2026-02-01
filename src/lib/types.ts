export type ProjectStatus = "backlog" | "in_progress" | "blocked" | "done";
export type TaskStatus = "backlog" | "in_progress" | "blocked" | "done";
export type Priority = "low" | "medium" | "high" | "critical";
export type BuildStatus = "pass" | "fail" | "unknown";
export type CronStatus = "active" | "paused" | "error" | "running";
export type ProjectPhase = "idea" | "research" | "build" | "launch" | "grow" | "iterate" | "maintain";
export type EffortEstimate = "tiny" | "small" | "medium" | "large" | "huge" | "unknown";
export type IdeaPotential = "low" | "medium" | "high" | "moonshot" | "unknown";
export type IdeaStatus = "new" | "researching" | "validated" | "promoted" | "rejected";
export type NoteType = "general" | "competitor" | "market" | "tech" | "user_feedback";

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
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  category: string;
  blocker_reason: string;
  created_at: string;
  updated_at: string;
  project_name?: string;
}

export interface Activity {
  id: number;
  project_id: number | null;
  type: string;
  title: string;
  description: string;
  metadata: string;
  created_at: string;
  project_name?: string;
}

export interface Comment {
  id: number;
  target_type: "task" | "activity" | "project";
  target_id: number;
  text: string;
  author: string;
  is_read: number;
  created_at: string;
}

export interface Cron {
  id: number;
  name: string;
  schedule: string;
  description: string;
  last_run: string;
  next_run: string;
  status: CronStatus;
  last_error: string;
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

export interface Metric {
  id: number;
  project_id: number;
  metric_name: string;
  metric_value: number;
  recorded_at: string;
  project_name?: string;
}

export interface PhaseChecklist {
  id: number;
  phase: string;
  item_order: number;
  title: string;
  description: string;
  is_template: number;
}

export interface ChecklistProgress {
  id: number;
  project_id: number;
  checklist_item_id: number;
  completed: number;
  completed_at: string;
  notes: string;
  // Joined fields
  title?: string;
  description?: string;
  item_order?: number;
  phase?: string;
}

export interface ResearchNote {
  id: number;
  idea_id: number | null;
  project_id: number | null;
  title: string;
  content: string;
  source_url: string;
  note_type: NoteType;
  created_at: string;
  // Joined fields
  idea_title?: string;
  project_name?: string;
}
