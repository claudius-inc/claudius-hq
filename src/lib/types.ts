export type ProjectStatus = "backlog" | "in_progress" | "blocked" | "done";
export type TaskStatus = "backlog" | "in_progress" | "blocked" | "done";
export type Priority = "low" | "medium" | "high" | "critical";
export type BuildStatus = "pass" | "fail" | "unknown";
export type CronStatus = "active" | "paused" | "error" | "running";

export interface Project {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
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
