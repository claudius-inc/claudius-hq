import { NextResponse } from "next/server";
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
import { logger } from "@/lib/logger";

// GET: Returns consolidated dashboard data
export async function GET() {
  try {
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

    // 2. Get pending tasks
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
    const epochStats = await db
      .select()
      .from(acpEpochStats)
      .orderBy(desc(acpEpochStats.epochNumber))
      .limit(1);
    const currentEpochStats = epochStats[0] ?? null;

    // 6. Get recent activities (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const activities = await db
      .select()
      .from(acpActivities)
      .where(gte(acpActivities.createdAt, oneDayAgo))
      .orderBy(desc(acpActivities.createdAt))
      .limit(50);

    // Calculate jobs today
    const jobsToday = activities.filter((a) => a.type === "job_completed").length;

    // Build top performers
    const topPerformers = offerings.slice(0, 5).map((o) => ({
      name: o.name,
      jobs: o.jobCount,
      revenue: o.totalRevenue,
      price: o.price,
      trend: 0, // Could calculate from metrics if available
    }));

    return NextResponse.json({
      state,
      tasks,
      topPerformers,
      wallet,
      epochStats: currentEpochStats,
      activities,
      jobsToday,
      offeringsCount: offerings.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("api/acp/dashboard", "Error fetching dashboard data", { error });
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
