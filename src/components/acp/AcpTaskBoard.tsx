"use client";

import { AcpTaskColumn } from "./AcpTaskColumn";

interface Task {
  id: number;
  pillar: string;
  priority?: number | null;
  title: string;
  description?: string | null;
  status?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
}

interface AcpTaskBoardProps {
  tasks: Task[];
}

export function AcpTaskBoard({ tasks }: AcpTaskBoardProps) {
  const pending = tasks.filter((t) => (t.status ?? "pending") === "pending");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "done").slice(0, 10);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <AcpTaskColumn title="Pending" status="pending" tasks={pending} count={pending.length} />
      <AcpTaskColumn title="In Progress" status="in_progress" tasks={inProgress} count={inProgress.length} />
      <AcpTaskColumn title="Done" status="done" tasks={done} count={done.length} />
    </div>
  );
}
