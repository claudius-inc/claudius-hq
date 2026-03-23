import { NextRequest, NextResponse } from "next/server";
import { getAgentInfo } from "@/lib/virtuals-client";
import { logger } from "@/lib/logger";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { sql } from "drizzle-orm";

// HQ_API_KEY is used internally by virtuals-client for authenticated calls

// Our provider address
const MY_ADDRESS = "0x46D4f9f23948fBbeF6b104B0cB571b3F6e551B6F";

// No auth required for read-only job stats
// Server uses HQ_API_KEY internally for Virtuals API calls

interface JobSummary {
  name: string;
  jobCount: number;
  totalRevenue: number;
}

/**
 * GET /api/acp/jobs
 *
 * Returns job statistics from database.
 * 
 * Note: The Virtuals API only provides job status by ID (GET /acp/jobs/{id}),
 * not a list of all completed jobs. Stats are tracked in our DB when jobs complete.
 * 
 * Query params:
 *   - limit: max number of offerings to return (default: 20)
 *   - role: filter by "provider" or "client" (optional, currently only provider supported)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const roleFilter = searchParams.get("role");

    // Get agent info for wallet verification (optional, falls back to default)
    let walletAddress = MY_ADDRESS;
    if (process.env.LITE_AGENT_API_KEY) {
      try {
        const agentInfo = await getAgentInfo();
        walletAddress = agentInfo.walletAddress || MY_ADDRESS;
      } catch {
        // Use default address if API fails
      }
    }

    // Get job stats from our database (aggregated per offering)
    const offerings = await db
      .select({
        name: acpOfferings.name,
        jobCount: acpOfferings.jobCount,
        totalRevenue: acpOfferings.totalRevenue,
      })
      .from(acpOfferings)
      .where(sql`${acpOfferings.jobCount} > 0`)
      .orderBy(sql`${acpOfferings.totalRevenue} DESC`)
      .limit(limit);

    const jobs: JobSummary[] = offerings.map((o) => ({
      name: o.name,
      jobCount: o.jobCount || 0,
      totalRevenue: o.totalRevenue || 0,
    }));

    // Calculate totals
    const totalJobs = jobs.reduce((sum, j) => sum + j.jobCount, 0);
    const totalRevenue = jobs.reduce((sum, j) => sum + j.totalRevenue, 0);

    // For now, all tracked jobs are as provider
    const asProvider = roleFilter === "client" ? 0 : totalJobs;
    const asClient = roleFilter === "provider" ? 0 : 0; // We don't track client jobs yet

    return NextResponse.json({
      walletAddress,
      jobs: jobs,
      stats: {
        total: jobs.length,
        totalJobs,
        asProvider,
        asClient,
        revenueUsdc: totalRevenue,
        spentUsdc: 0,
      },
    });
  } catch (err) {
    const error = err as Error;
    logger.error("api/acp/jobs", `Failed to get jobs: ${error.message}`);
    return NextResponse.json(
      { error: "Failed to fetch jobs", details: error.message },
      { status: 500 }
    );
  }
}
