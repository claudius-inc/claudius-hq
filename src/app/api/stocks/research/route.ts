import { NextRequest, NextResponse } from "next/server";
import { db, researchJobs } from "@/db";
import { eq, desc, inArray } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker } = body;

    if (!ticker || typeof ticker !== "string") {
      return NextResponse.json(
        { error: "Ticker is required" },
        { status: 400 }
      );
    }

    const cleanTicker = ticker.toUpperCase().trim();
    
    // Validate ticker format (basic check)
    if (!/^[A-Z0-9.]{1,10}$/.test(cleanTicker)) {
      return NextResponse.json(
        { error: "Invalid ticker format" },
        { status: 400 }
      );
    }

    // Check if there's already a pending/processing job for this ticker
    const [existing] = await db
      .select({ id: researchJobs.id, status: researchJobs.status })
      .from(researchJobs)
      .where(eq(researchJobs.ticker, cleanTicker))
      .limit(1);

    if (existing && (existing.status === "pending" || existing.status === "processing")) {
      return NextResponse.json({
        jobId: existing.id,
        ticker: cleanTicker,
        status: existing.status,
        message: "Research already in progress for this ticker.",
      });
    }

    // Generate a job ID and create the job record
    const jobId = `research-${cleanTicker}-${Date.now()}`;
    
    await db.insert(researchJobs).values({
      id: jobId,
      ticker: cleanTicker,
      status: "pending",
      progress: 0,
    });

    console.log(`[Research Queue] Ticker: ${cleanTicker}, JobId: ${jobId}`);

    // Trigger OpenClaw gateway to spawn research sub-agent
    const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "https://gateway.claudiusinc.com";
    const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
    
    if (gatewayToken) {
      try {
        const spawnResponse = await fetch(`${gatewayUrl}/tools/invoke`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${gatewayToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tool: "sessions_spawn",
            args: {
              task: `Generate a COMPREHENSIVE Sun Tzu investment research report for ${cleanTicker}.

**JOB ID:** ${jobId}

**TICKER INTERPRETATION:**
- The exact ticker provided is: ${cleanTicker}
- If the ticker includes an exchange suffix (e.g., .HK, .SI, .AX, .L), research THAT specific stock
- If no suffix, assume it's a US-listed stock (NYSE/NASDAQ)
- Do NOT substitute with a different exchange unless the user specifically included that suffix
- Example: "NXT" = US stock, "NXT.AX" = Australian stock NEXTDC

**CRITICAL REQUIREMENTS:**
- Read the skill file: /root/openclaw/skills/sun-tzu-research/SKILL.md
- Follow ALL 14 sections exactly as specified in the skill
- Report MUST be 3,000-5,000 words (approximately 15,000-25,000 characters)
- Include 5-year historical data tables (ROE, D/E)
- Include 4-6 bull points AND 4-6 bear points with Sun Tzu quotes
- Include detailed management assessment with integrity/alignment scoring
- Include price-based action table with specific price zones

**EXECUTION STEPS:**
1. Mark job as processing:
   curl -X PATCH 'https://www.claudiusinc.com/api/stocks/research/${jobId}' -H 'x-api-key: ${process.env.HQ_API_KEY}' -H 'Content-Type: application/json' -d '{"status":"processing","progress":10}'

2. Gather comprehensive data on ${cleanTicker} using web_search and web_fetch

3. Write the full 14-section report following /root/openclaw/skills/sun-tzu-research/SKILL.md

4. POST the complete report:
   curl -X POST 'https://www.claudiusinc.com/api/stocks/reports' -H 'x-api-key: ${process.env.HQ_API_KEY}' -H 'Content-Type: application/json' -d '{"ticker":"${cleanTicker}","title":"...","content":"<FULL REPORT>","report_type":"sun-tzu"}'

5. Complete the job with report_id:
   curl -X PATCH 'https://www.claudiusinc.com/api/stocks/research/${jobId}' -H 'x-api-key: ${process.env.HQ_API_KEY}' -H 'Content-Type: application/json' -d '{"status":"complete","progress":100,"report_id":REPORT_ID}'

DO NOT rush. Take your time to produce a thorough, publication-quality report.`,
              label: `research-${cleanTicker.toLowerCase()}`,
              cleanup: "delete",
              thinking: "high",
              runTimeoutSeconds: 600,
            },
          }),
        });
        
        if (!spawnResponse.ok) {
          console.error("[Research] Gateway spawn failed:", await spawnResponse.text());
        } else {
          console.log("[Research] Sub-agent spawned for", cleanTicker);
        }
      } catch (gatewayError) {
        console.error("[Research] Gateway call failed:", gatewayError);
        // Don't fail the request - job is queued, can be picked up by polling
      }
    }

    return NextResponse.json({
      jobId,
      ticker: cleanTicker,
      status: "pending",
      message: "Research started. This typically takes 2-3 minutes.",
    });
  } catch (error) {
    console.error("[Research API Error]", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const status = searchParams.get("status");

  try {
    if (jobId) {
      // Get specific job
      const [job] = await db
        .select()
        .from(researchJobs)
        .where(eq(researchJobs.id, jobId));
      
      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      
      return NextResponse.json({ job });
    }

    // Get all jobs, optionally filtered by status
    let jobs;
    if (status) {
      jobs = await db
        .select()
        .from(researchJobs)
        .where(eq(researchJobs.status, status))
        .orderBy(desc(researchJobs.createdAt))
        .limit(50);
    } else {
      jobs = await db
        .select()
        .from(researchJobs)
        .orderBy(desc(researchJobs.createdAt))
        .limit(50);
    }
    
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("[Research API Error]", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
