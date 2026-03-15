import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import { db } from "@/db";
import {
  acpState,
  acpTasks,
  acpDecisions,
  acpStrategy,
  acpOfferings,
  acpActivities,
  acpPriceExperiments,
  acpWalletSnapshots,
  acpEpochStats,
} from "@/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { logger } from "@/lib/logger";

interface HeartbeatAlert {
  type: "warning" | "error" | "info";
  message: string;
  data?: unknown;
}

// GET: Returns everything an agent needs for a heartbeat
export async function GET(_req: NextRequest) {
  if (!checkApiAuth(_req)) return unauthorizedResponse();
  try {
  if (!checkApiAuth(_req)) return unauthorizedResponse();
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

    // 2. Get highest priority pending task
    const pendingTasks = await db
      .select()
      .from(acpTasks)
      .where(eq(acpTasks.status, "pending"))
      .orderBy(desc(acpTasks.priority), acpTasks.createdAt)
      .limit(5);
    
    const nextTask = pendingTasks[0] ?? null;

    // 3. Get recent decisions (last 5)
    const recentDecisions = await db
      .select()
      .from(acpDecisions)
      .orderBy(desc(acpDecisions.createdAt))
      .limit(5);

    // 4. Get strategy params grouped
    const strategyParams = await db.select().from(acpStrategy);
    const strategy: Record<string, Record<string, unknown>> = {};
    for (const p of strategyParams) {
      const cat = p.category ?? "uncategorized";
      if (!strategy[cat]) strategy[cat] = {};
      let value: unknown = p.value;
      if (p.value) {
        try {
          value = JSON.parse(p.value);
        } catch {
          // Keep as string
        }
      }
      strategy[cat][p.key] = value;
    }

    // 5. Get active experiments (price experiments in "measuring" status)
    const activeExperiments = await db
      .select()
      .from(acpPriceExperiments)
      .where(eq(acpPriceExperiments.status, "measuring"))
      .limit(10);

    // 6. Get offerings summary
    const offerings = await db
      .select()
      .from(acpOfferings)
      .where(eq(acpOfferings.isActive, 1))
      .orderBy(desc(acpOfferings.jobCount));

    const offeringsSummary = {
      total: offerings.length,
      totalRevenue: offerings.reduce((sum, o) => sum + (o.totalRevenue ?? 0), 0),
      totalJobs: offerings.reduce((sum, o) => sum + (o.jobCount ?? 0), 0),
      topPerformers: offerings.slice(0, 5).map(o => ({
        name: o.name,
        jobs: o.jobCount,
        revenue: o.totalRevenue,
        price: o.price,
      })),
    };

    // 7. Get latest wallet snapshot
    const walletSnapshots = await db
      .select()
      .from(acpWalletSnapshots)
      .orderBy(desc(acpWalletSnapshots.snapshotAt))
      .limit(1);
    const wallet = walletSnapshots[0] ?? null;

    // 8. Get recent activity (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentActivities = await db
      .select()
      .from(acpActivities)
      .where(gte(acpActivities.createdAt, oneDayAgo))
      .orderBy(desc(acpActivities.createdAt))
      .limit(20);

    // 9. Get current epoch stats
    const epochStats = await db
      .select()
      .from(acpEpochStats)
      .orderBy(desc(acpEpochStats.epochNumber))
      .limit(1);
    const currentEpochStats = epochStats[0] ?? null;

    // 10. Build alerts based on data analysis
    const alerts: HeartbeatAlert[] = [];

    // Alert: Server not running
    if (state.serverRunning === 0) {
      alerts.push({
        type: "error",
        message: "ACP server is not running",
      });
    }

    // Alert: No heartbeat in last hour
    if (state.lastHeartbeat) {
      const lastHb = new Date(state.lastHeartbeat);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastHb < hourAgo) {
        alerts.push({
          type: "warning",
          message: `Last heartbeat was ${Math.round((Date.now() - lastHb.getTime()) / 60000)} minutes ago`,
        });
      }
    }

    // Alert: Behind on epoch goals
    if (state.targetJobs && state.jobsThisEpoch !== null) {
      const progress = state.jobsThisEpoch / state.targetJobs;
      if (progress < 0.5 && state.epochEnd) {
        const epochEnd = new Date(state.epochEnd);
        const now = new Date();
        const epochProgress = state.epochStart 
          ? (now.getTime() - new Date(state.epochStart).getTime()) / (epochEnd.getTime() - new Date(state.epochStart).getTime())
          : 0;
        if (epochProgress > 0.5) {
          alerts.push({
            type: "warning",
            message: `Only ${Math.round(progress * 100)}% of job target completed with ${Math.round((1 - epochProgress) * 100)}% of epoch remaining`,
            data: { jobsCompleted: state.jobsThisEpoch, targetJobs: state.targetJobs },
          });
        }
      }
    }

    // Alert: No jobs in last 24h
    const jobsLast24h = recentActivities.filter(a => a.type === "job_completed").length;
    if (jobsLast24h === 0 && offerings.length > 0) {
      alerts.push({
        type: "info",
        message: "No jobs completed in the last 24 hours",
      });
    }

    // Alert: Failed jobs
    const failedJobs = recentActivities.filter(a => a.type === "job_failed");
    if (failedJobs.length > 0) {
      alerts.push({
        type: "warning",
        message: `${failedJobs.length} failed job(s) in the last 24 hours`,
        data: failedJobs.slice(0, 3).map(j => ({ jobId: j.jobId, offering: j.offering })),
      });
    }

    // 11. Build instructions based on current pillar and state
    let instructions = "";
    const pillar = state.currentPillar;

    switch (pillar) {
      case "quality":
        instructions = `Focus on QUALITY: Ensure offerings are reliable and deliver value. ` +
          `Review any failed jobs (${failedJobs.length} failures). ` +
          `Check customer feedback and improve responses.`;
        break;
      case "replace":
        instructions = `Focus on REPLACE: Identify underperforming offerings. ` +
          `Consider replacing low-revenue offerings with new experiments. ` +
          `Review competitor pricing and positioning.`;
        break;
      case "build":
        instructions = `Focus on BUILD: Create new offerings. ` +
          `Current count: ${offerings.length}. ` +
          `Prioritize high-demand categories and unique value propositions.`;
        break;
      case "experiment":
        instructions = `Focus on EXPERIMENT: Run pricing and positioning tests. ` +
          `Active experiments: ${activeExperiments.length}. ` +
          `Analyze results and iterate quickly.`;
        break;
    }

    if (nextTask) {
      instructions += ` Next task: [${nextTask.pillar}] ${nextTask.title}`;
    }

    // Update lastHeartbeat in state
    await db
      .update(acpState)
      .set({ lastHeartbeat: new Date().toISOString() })
      .where(eq(acpState.id, 1));

    return NextResponse.json({
      state,
      nextTask,
      pendingTasks: pendingTasks.length,
      recentDecisions,
      strategy,
      activeExperiments,
      offeringsSummary,
      wallet,
      currentEpochStats,
      recentActivity: {
        last24h: recentActivities.length,
        jobsCompleted: jobsLast24h,
        jobsFailed: failedJobs.length,
      },
      alerts,
      instructions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("api/acp/heartbeat-context", "Error building heartbeat context", { error });
    return NextResponse.json({ error: "Failed to build heartbeat context" }, { status: 500 });
  }
}
