import { db } from "@/db";
import {
  acpState,
  acpTasks,
  acpOfferings,
  acpActivities,
  acpWalletSnapshots,
  acpEpochStats,
} from "@/db/schema";
import { eq, desc, gte } from "drizzle-orm";
import {
  AcpServerStatus,
  AcpStateCard,
  AcpWalletCard,
  AcpEpochCard,
  AcpTopPerformers,
  AcpPendingTasks,
  AcpActivityFeed,
} from "@/components/acp";

export const revalidate = 60; // Revalidate every minute

async function getDashboardData() {
  // 1. Get current state
  const stateRows = await db.select().from(acpState).where(eq(acpState.id, 1));
  const state = stateRows[0] ?? {
    id: 1,
    currentPillar: "quality",
    currentEpoch: null,
    epochStart: null,
    epochEnd: null,
    jobsThisEpoch: 0,
    revenueThisEpoch: 0,
    targetJobs: null,
    targetRevenue: null,
    targetRank: null,
    serverRunning: 1,
    serverPid: null,
    lastHeartbeat: null,
    updatedAt: new Date().toISOString(),
  };

  // 2. Get tasks
  const tasks = await db
    .select()
    .from(acpTasks)
    .orderBy(desc(acpTasks.priority), acpTasks.createdAt)
    .limit(20);

  // 3. Get offerings
  const offerings = await db
    .select()
    .from(acpOfferings)
    .where(eq(acpOfferings.isActive, 1))
    .orderBy(desc(acpOfferings.totalRevenue));

  // 4. Get latest wallet snapshot
  const walletSnapshots = await db
    .select()
    .from(acpWalletSnapshots)
    .orderBy(desc(acpWalletSnapshots.snapshotAt))
    .limit(1);
  const wallet = walletSnapshots[0] ?? null;

  // 5. Get current epoch stats
  const epochStatsRows = await db
    .select()
    .from(acpEpochStats)
    .orderBy(desc(acpEpochStats.epochNumber))
    .limit(1);
  const epochStats = epochStatsRows[0] ?? null;

  // 6. Get recent activities (last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const activities = await db
    .select()
    .from(acpActivities)
    .where(gte(acpActivities.createdAt, oneDayAgo))
    .orderBy(desc(acpActivities.createdAt))
    .limit(50);

  const jobsToday = activities.filter((a) => a.type === "job_completed").length;

  const topPerformers = offerings.slice(0, 5).map((o) => ({
    name: o.name,
    jobs: o.jobCount,
    revenue: o.totalRevenue,
    price: o.price,
    trend: 0,
  }));

  return {
    state,
    tasks,
    topPerformers,
    wallet,
    epochStats,
    activities,
    jobsToday,
    offeringsCount: offerings.length,
  };
}

export default async function AcpDashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            ACP Operations Center
          </h1>
          <p className="text-sm text-gray-500">
            Agent Commerce Protocol dashboard
          </p>
        </div>
        <AcpServerStatus
          isRunning={data.state.serverRunning === 1}
          lastHeartbeat={data.state.lastHeartbeat}
        />
      </div>

      {/* State Card */}
      <AcpStateCard state={data.state} epochStats={data.epochStats} />

      {/* Two Column Grid: Wallet + Epoch */}
      <div className="grid md:grid-cols-2 gap-4">
        <AcpWalletCard wallet={data.wallet} />
        <AcpEpochCard epochStats={data.epochStats} jobsToday={data.jobsToday} />
      </div>

      {/* Top Performers */}
      <AcpTopPerformers performers={data.topPerformers} />

      {/* Two Column Grid: Activity + Tasks */}
      <div className="grid md:grid-cols-2 gap-4">
        <AcpActivityFeed activities={data.activities} maxItems={10} />
        <AcpPendingTasks tasks={data.tasks} />
      </div>
    </div>
  );
}
