import { db } from "@/db";
import { acpTasks } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHero } from "@/components/PageHero";
import { AcpTaskBoard } from "@/components/acp/AcpTaskBoard";
import { AcpPillarSummary } from "@/components/acp/AcpPillarSummary";

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
      <PageHero
        title="Task Board"
        subtitle={`${pendingCount} pending, ${inProgressCount} in progress`}
      />

      {/* Pillar Summary */}
      <AcpPillarSummary tasks={tasks} />

      {/* Kanban Board */}
      <AcpTaskBoard tasks={tasks} />
    </div>
  );
}
