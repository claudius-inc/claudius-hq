#!/usr/bin/env node
/**
 * Research Job Processor — Production Version
 *
 * Polls Claudius HQ for pending research jobs, generates Sun Tzu reports,
 * and saves them back to HQ.
 *
 * Run manually:
 *   cd /root/.openclaw/workspace/projects/claudius-hq && npx tsx scripts/process-research-jobs-prod.ts
 *
 * Run as daemon (processes jobs continuously):
 *   npx tsx scripts/process-research-jobs-prod.ts --daemon
 *
 * Setup cron (run every 5 minutes):
 *   every 5 min: cd /root/.openclaw/workspace/projects/claudius-hq && npx tsx scripts/process-research-jobs-prod.ts >> /var/log/research-jobs.log 2>&1
 */

import { createClient } from "@libsql/client";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const TURSO_URL = process.env.TURSO_DATABASE_URL || "libsql://claudius-hq-manapixels.aws-ap-northeast-1.turso.io";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || "";
const HQ_API_KEY = process.env.HQ_API_KEY || "";
const HQ_API = "https://claudiusinc.com/api";

// OpenClaw gateway for spawning sub-agents (if running inside OpenClaw context)
const OPENCLAW_API = process.env.OPENCLAW_GATEWAY_URL || "http://localhost:3000";

const headers = {
  Authorization: `Bearer ${HQ_API_KEY}`,
  "Content-Type": "application/json",
};

// ─── DB CLIENT ──────────────────────────────────────────────────────────────
let db: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (!db) {
    db = createClient({
      url: TURSO_URL,
      authToken: TURSO_TOKEN,
    });
  }
  return db;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function log(msg: string, data?: any) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`, data ? JSON.stringify(data) : "");
}

async function fetchPendingJobs(): Promise<any[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM research_jobs WHERE status = 'pending' ORDER BY created_at DESC LIMIT 5`,
    args: [],
  });
  return result.rows;
}

async function updateJobStatus(
  jobId: string,
  status: string,
  progress?: number,
  reportId?: number | null,
  errorMessage?: string | null
) {
  const db = getDb();
  const updates: string[] = ["status = ?"];
  const args: any[] = [status, jobId];

  if (progress !== undefined) {
    updates.push("progress = ?");
    args.splice(1, 0, progress);
  }
  if (reportId !== undefined) {
    updates.push("report_id = ?");
    args.splice(args.length - 1, 0, reportId);
  }
  if (errorMessage !== undefined) {
    updates.push("error_message = ?");
    args.splice(args.length - 1, 0, errorMessage);
  }
  updates.push("updated_at = datetime('now')");

  const sql = `UPDATE research_jobs SET ${updates.join(", ")} WHERE id = ?`;
  await db.execute({ sql, args });
}

async function createReport(
  ticker: string,
  title: string,
  content: string,
  reportType: string = "sun-tzu",
  companyName?: string
) {
  const res = await fetch(`${HQ_API}/stocks/reports`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ticker,
      title,
      content,
      report_type: reportType,
      company_name: companyName,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create report: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.report;
}

// ─── REPORT GENERATION ───────────────────────────────────────────────────────

/**
 * Spawn an OpenClaw sub-agent to generate a Sun Tzu report.
 * This requires the OpenClaw gateway to be running.
 */
async function spawnSunTzuReport(ticker: string): Promise<{ title: string; content: string; companyName?: string }> {
  log(`[${ticker}] Attempting to spawn OpenClaw sub-agent for Sun Tzu report...`);

  try {
    // Call OpenClaw gateway API to spawn a sub-agent
    const res = await fetch(`${OPENCLAW_API}/api/v1/sessions/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: `Generate a comprehensive Sun Tzu investment research report for ticker ${ticker}. Use the sun-tzu-research skill. Fetch live data from Yahoo Finance. Write all 18 sections. Return the full markdown report.`,
        thinking: "high",
        runTimeoutSeconds: 600,
        model: "kimi/kimi-code",
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenClaw spawn failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    log(`[${ticker}] Sub-agent spawned, session: ${data.sessionKey}`);

    // Wait for completion (poll)
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes
    while (attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 10000));

      const pollRes = await fetch(`${OPENCLAW_API}/api/v1/sessions/${data.sessionKey}/status`);
      if (!pollRes.ok) continue;

      const status = await pollRes.json();
      if (status.state === "completed") {
        log(`[${ticker}] Sub-agent completed`);
        // Extract report from session history
        const historyRes = await fetch(`${OPENCLAW_API}/api/v1/sessions/${data.sessionKey}/history?limit=5`);
        const history = await historyRes.json();
        const lastMessage = history.messages?.[history.messages.length - 1];
        const content = lastMessage?.content || "";

        return {
          title: `${ticker}: Sun Tzu Deep Dive`,
          content,
        };
      }
      if (status.state === "failed" || status.state === "error") {
        throw new Error(`Sub-agent failed: ${status.error}`);
      }
      attempts++;
      log(`[${ticker}] Waiting for sub-agent... attempt ${attempts}/${maxAttempts}`);
    }

    throw new Error("Sub-agent timed out");
  } catch (e) {
    log(`[${ticker}] Sub-agent approach failed, falling back to simplified report:`, String(e));
    return generateSimplifiedReport(ticker);
  }
}

/**
 * Fallback simplified report when sub-agent spawn is unavailable.
 * Uses Yahoo Finance data + basic analysis.
 */
async function generateSimplifiedReport(ticker: string): Promise<{ title: string; content: string; companyName?: string }> {
  log(`[${ticker}] Generating simplified report...`);

  let quote: any = {};
  try {
    // Use yahoo-finance2 via a quick API call or direct import
    const yf = await import("yahoo-finance2").then((m) => m.default);
    quote = await yf.quote(ticker);
  } catch (e) {
    log(`[${ticker}] Yahoo Finance fetch failed:`, String(e));
  }

  const price = quote?.regularMarketPrice || "N/A";
  const change = quote?.regularMarketChangePercent || 0;
  const name = quote?.shortName || quote?.longName || ticker;
  const marketCap = quote?.marketCap ? (quote.marketCap / 1e9).toFixed(2) + "B" : "N/A";
  const pe = quote?.trailingPE || "N/A";
  const fiftyTwoWeekHigh = quote?.fiftyTwoWeekHigh || "N/A";
  const fiftyTwoWeekLow = quote?.fiftyTwoWeekLow || "N/A";

  const content = `## 1. Opening — ${name}

*"The general who wins makes many calculations in his temple before the battle is fought."*

${name} (${ticker}) is a stock currently trading at **$${price}** (${change > 0 ? "+" : ""}${change.toFixed(2)}%). This is a simplified auto-generated report. A full 18-section Sun Tzu deep-dive requires manual agent processing.

## 2. What Does ${name} Do?

Please refer to the company's investor relations page for full business description.

## 3. Strategic Overview Table

| Metric | Value |
|--------|-------|
| Stock Price | $${price} |
| 52-Week Range | $${fiftyTwoWeekLow} - $${fiftyTwoWeekHigh} |
| Market Cap | $${marketCap} |
| P/E Ratio (TTM) | ${pe} |
| Day Change | ${change > 0 ? "+" : ""}${change.toFixed(2)}% |

## 4. Technical Snapshot

- Current Price: $${price}
- 52-Week High: $${fiftyTwoWeekHigh}
- 52-Week Low: $${fiftyTwoWeekLow}

## 5. Sun Tzu's Verdict

**Note:** This is an auto-generated placeholder report. For a full deep-dive with competitive analysis, management assessment, bull/bear thesis, and price action tables, please request a comprehensive Sun Tzu report via the research interface.

---

*Disclaimer: This report is for informational purposes only and does not constitute investment advice. Data sourced from Yahoo Finance. Generated on ${new Date().toISOString()}.*
`;

  return {
    title: `${name} (${ticker}) — Quick Analysis`,
    content,
    companyName: name,
  };
}

// ─── MAIN PROCESSOR ──────────────────────────────────────────────────────────

async function processJob(job: any): Promise<boolean> {
  const { id: jobId, ticker } = job;

  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log(`Processing job: ${jobId} (${ticker})`);
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  try {
    // 1. Mark as processing
    await updateJobStatus(jobId, "processing", 10);
    log(`[${ticker}] Status → processing`);

    // 2. Generate report
    const report = await spawnSunTzuReport(ticker);
    await updateJobStatus(jobId, "processing", 80);
    log(`[${ticker}] Report generated (${report.content.length} chars)`);

    // 3. Save to HQ
    const saved = await createReport(
      ticker,
      report.title,
      report.content,
      "sun-tzu",
      report.companyName
    );
    log(`[${ticker}] Report saved: ID ${saved.id}`);

    // 4. Mark complete
    await updateJobStatus(jobId, "complete", 100, saved.id, null);
    log(`✅ Job ${jobId} completed successfully`);

    return true;
  } catch (error) {
    const errMsg = String(error);
    log(`❌ Job ${jobId} failed:`, errMsg);
    try {
      await updateJobStatus(jobId, "failed", 0, null, errMsg);
    } catch (e) {
      log(`Failed to mark job as failed:`, String(e));
    }
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const daemon = args.includes("--daemon");
  const once = args.includes("--once") || !daemon;

  log("🔬 Research Job Processor (Production)");
  log(`Mode: ${daemon ? "DAEMON" : "SINGLE RUN"}`);
  log(`Turso: ${TURSO_URL}`);
  log(`HQ API: ${HQ_API}`);
  log(`OpenClaw Gateway: ${OPENCLAW_API}`);

  // Validate config
  if (!TURSO_TOKEN && !HQ_API_KEY) {
    log("ERROR: Need either TURSO_AUTH_TOKEN or HQ_API_KEY");
    process.exit(1);
  }

  do {
    try {
      const jobs = await fetchPendingJobs();
      log(`Found ${jobs.length} pending job(s)`);

      if (jobs.length === 0) {
        if (once) {
          log("No pending jobs. Exiting.");
          break;
        }
        log("No pending jobs. Waiting 60s...");
        await new Promise((r) => setTimeout(r, 60000));
        continue;
      }

      // Process all pending jobs
      for (const job of jobs) {
        await processJob(job);
        // Small delay between jobs
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (once) break;

      log("Batch complete. Waiting 60s before next poll...");
      await new Promise((r) => setTimeout(r, 60000));
    } catch (error) {
      log("Fatal error:", String(error));
      if (once) process.exit(1);
      log("Retrying in 60 seconds...");
      await new Promise((r) => setTimeout(r, 60000));
    }
  } while (daemon);
}

main().catch((e) => {
  log("Unhandled error:", String(e));
  process.exit(1);
});
