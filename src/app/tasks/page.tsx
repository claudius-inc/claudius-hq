import db from "@/lib/db";
import { Task } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { KanbanBoard } from "@/components/KanbanBoard";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  let tasks: Task[] = [];
  try {
    const result = await db.execute(
      "SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, t.updated_at DESC"
    );
    tasks = result.rows as unknown as Task[];
  } catch { /* DB not initialized yet */ }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-zinc-100 mb-6">All Tasks</h1>
        <KanbanBoard tasks={tasks} />
      </main>
    </div>
  );
}
