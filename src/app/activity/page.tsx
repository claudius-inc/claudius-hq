import db from "@/lib/db";
import { Activity } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { ActivityFeed } from "@/components/ActivityFeed";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  let activity: Activity[] = [];
  try {
    const result = await db.execute(
      "SELECT a.*, p.name as project_name FROM activity a LEFT JOIN projects p ON a.project_id = p.id ORDER BY a.created_at DESC LIMIT 100"
    );
    activity = result.rows as unknown as Activity[];
  } catch { /* DB not initialized yet */ }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Activity Feed</h1>
        <div className="max-w-3xl">
          <ActivityFeed activity={activity} />
        </div>
      </main>
    </div>
  );
}
