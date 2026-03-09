import { db } from "@/db";
import { acpTasks } from "@/db/schema";
import { desc } from "drizzle-orm";
import { AcpTaskBoard } from "@/components/acp/AcpTaskBoard";
import { AcpPillarSummary } from "@/components/acp/AcpPillarSummary";
import { CheckSquare } from "lucide-react";

export const revalidate = 60;

async function getTasksData() {
  const tasks = await db
    .select()
    .from(acpTasks)
    .orderBy(desc(acpTasks.priority), desc(acpTasks.createdAt));

  return { tasks };
}

export default async function AcpTasksPage() {
  const { tasks } = await getTasksData();
  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-gray-400" />
            Task Board
          </h1>
          <p className="text-sm text-gray-500">
            {pendingCount} pending, {inProgressCount} in progress
          </p>
        </div>
      </div>

      {/* Pillar Summary */}
      <AcpPillarSummary tasks={tasks} />

      {/* Kanban Board */}
      <AcpTaskBoard tasks={tasks} />
    </div>
  );
}
