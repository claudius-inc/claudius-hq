import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;
const ACP_DIR = "/root/.openclaw/workspace/skills/acp";

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

interface AcpJob {
  jobId: string;
  name: string;
  price: string;
  client: string;
  provider: string;
  deliverable: string;
  role: "provider" | "client";
}

function parseJobsOutput(output: string): AcpJob[] {
  const jobs: AcpJob[] = [];
  const lines = output.split("\n");
  
  let currentJob: Partial<AcpJob> = {};
  const myAddress = "0x46D4f9f23948fBbeF6b104B0cB571b3F6e551B6F"; // Our provider address

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith("Job ID")) {
      // Save previous job if exists
      if (currentJob.jobId) {
        // Determine if we're provider or client
        currentJob.role = currentJob.provider === myAddress ? "provider" : "client";
        jobs.push(currentJob as AcpJob);
      }
      currentJob = { jobId: trimmed.replace("Job ID", "").trim() };
    } else if (trimmed.startsWith("Name")) {
      currentJob.name = trimmed.replace("Name", "").trim();
    } else if (trimmed.startsWith("Price")) {
      currentJob.price = trimmed.replace("Price", "").trim();
    } else if (trimmed.startsWith("Client")) {
      currentJob.client = trimmed.replace("Client", "").trim();
    } else if (trimmed.startsWith("Provider")) {
      currentJob.provider = trimmed.replace("Provider", "").trim();
    } else if (trimmed.startsWith("Deliverable")) {
      currentJob.deliverable = trimmed.replace("Deliverable", "").trim();
    }
  }

  // Push last job
  if (currentJob.jobId) {
    currentJob.role = currentJob.provider === myAddress ? "provider" : "client";
    jobs.push(currentJob as AcpJob);
  }

  return jobs;
}

/**
 * GET /api/acp/jobs
 *
 * Returns recent completed jobs from ACP CLI
 * Query params:
 *   - limit: max number of jobs to return (default: 20)
 *   - role: filter by "provider" or "client" (optional)
 */
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const roleFilter = searchParams.get("role") as "provider" | "client" | null;

    const output = execSync(`cd ${ACP_DIR} && npx tsx bin/acp.ts job completed 2>&1`, {
      encoding: "utf-8",
      timeout: 30000,
    });

    let jobs = parseJobsOutput(output);

    // Apply role filter if specified
    if (roleFilter) {
      jobs = jobs.filter((j) => j.role === roleFilter);
    }

    // Apply limit
    jobs = jobs.slice(0, limit);

    // Calculate stats
    const providerJobs = jobs.filter((j) => j.role === "provider");
    const clientJobs = jobs.filter((j) => j.role === "client");
    
    // Parse revenue from price strings like "0.2 USDC"
    const totalRevenue = providerJobs.reduce((sum, j) => {
      const priceMatch = j.price.match(/([\d.]+)/);
      return sum + (priceMatch ? parseFloat(priceMatch[1]) : 0);
    }, 0);

    const totalSpent = clientJobs.reduce((sum, j) => {
      const priceMatch = j.price.match(/([\d.]+)/);
      return sum + (priceMatch ? parseFloat(priceMatch[1]) : 0);
    }, 0);

    return NextResponse.json({
      jobs,
      stats: {
        total: jobs.length,
        asProvider: providerJobs.length,
        asClient: clientJobs.length,
        revenueUsdc: totalRevenue,
        spentUsdc: totalSpent,
      },
      raw: output,
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
