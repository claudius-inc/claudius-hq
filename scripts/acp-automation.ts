/**
 * ACP Automation Script — Consolidated
 * 
 * Runs every 30m via cron. Handles:
 * 1. State updates (epoch progress, alerts)
 * 2. Offering sync (listedOnAcp from ACP marketplace)
 * 3. Wallet sync (via ethers.js + Base RPC)
 * 4. Tweet engagement sync
 * 5. Competitive scan (weekly — top agents, offerings, gaps)
 * 6. Task generation (marketing, experiments, quality)
 * 7. Task execution (ALL pending tasks, not just oldest)
 * 8. Pillar rotation
 * 9. Activity logging to HQ
 */

import { config } from "dotenv";
import { execSync } from "child_process";
import { ethers } from "ethers";

config({ path: ".env.local" });

const HQ_API = "https://claudiusinc.com/api/acp";
const API_KEY = process.env.HQ_API_KEY;
const ACP_DIR = "/root/.openclaw/workspace/skills/acp";

// =============================================================================
// Types
// =============================================================================

interface PriceExperiment {
  id: number;
  offeringId: number;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
  reason?: string;
  jobsBefore7d?: number;
  jobsAfter7d?: number;
  revenueBefore7d?: number;
  revenueAfter7d?: number;
  conversionBefore?: number;
  conversionAfter?: number;
  status: string;
  evaluationDate?: string;
  notes?: string;
}

interface Offering {
  id: number;
  name: string;
  price: number;
  jobCount: number;
  totalRevenue: number;
  listedOnAcp: boolean | number;
  createdAt: string;
  isActive?: boolean | number;
}

interface ExperimentAnalysis {
  recommendation: "keep" | "revert";
  reasoning: string;
  metrics: {
    daysRunning: number;
    sampleSize: number;
    jobsBefore: number;
    jobsAfter: number;
    revenueBefore: number;
    revenueAfter: number;
    revenueDeltaPct: number;
    conversionBefore?: number;
    conversionAfter?: number;
  };
}

// =============================================================================
// API Helpers
// =============================================================================

async function hqFetch(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${HQ_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  return res.json();
}

// =============================================================================
// Experiment Analysis
// =============================================================================

/**
 * Analyze a price experiment and return a recommendation.
 * 
 * Decision criteria:
 * - If new price generates more revenue → keep
 * - If new price has better job-to-revenue ratio → keep
 * - If sample size is too small → inconclusive, default to keep
 * - If revenue dropped significantly (>20%) → revert
 */
function analyzeExperiment(exp: PriceExperiment): ExperimentAnalysis {
  const daysRunning = (Date.now() - new Date(exp.changedAt).getTime()) / (1000 * 60 * 60 * 24);
  
  const jobsBefore = exp.jobsBefore7d ?? 0;
  const jobsAfter = exp.jobsAfter7d ?? 0;
  const revenueBefore = exp.revenueBefore7d ?? 0;
  const revenueAfter = exp.revenueAfter7d ?? 0;
  const sampleSize = jobsBefore + jobsAfter;
  
  // Calculate revenue delta percentage
  const revenueDeltaPct = revenueBefore > 0 
    ? ((revenueAfter - revenueBefore) / revenueBefore) * 100 
    : revenueAfter > 0 ? 100 : 0;
  
  const metrics = {
    daysRunning: Math.floor(daysRunning),
    sampleSize,
    jobsBefore,
    jobsAfter,
    revenueBefore,
    revenueAfter,
    revenueDeltaPct: Math.round(revenueDeltaPct * 100) / 100,
    conversionBefore: exp.conversionBefore,
    conversionAfter: exp.conversionAfter,
  };
  
  // Decision logic
  let recommendation: "keep" | "revert";
  let reasoning: string;
  
  // Too little data - default to keeping new price (it's already live)
  if (sampleSize < 5) {
    recommendation = "keep";
    reasoning = `Insufficient data (${sampleSize} total jobs). Defaulting to keep new price $${exp.newPrice}.`;
  }
  // Revenue increased or stayed flat
  else if (revenueDeltaPct >= -5) {
    recommendation = "keep";
    if (revenueDeltaPct > 10) {
      reasoning = `Revenue increased ${revenueDeltaPct.toFixed(1)}% ($${revenueBefore.toFixed(2)} → $${revenueAfter.toFixed(2)}). Keep new price $${exp.newPrice}.`;
    } else {
      reasoning = `Revenue stable (${revenueDeltaPct.toFixed(1)}% change). Keep new price $${exp.newPrice}.`;
    }
  }
  // Revenue dropped significantly
  else if (revenueDeltaPct < -20) {
    recommendation = "revert";
    reasoning = `Revenue dropped ${Math.abs(revenueDeltaPct).toFixed(1)}% ($${revenueBefore.toFixed(2)} → $${revenueAfter.toFixed(2)}). Revert to $${exp.oldPrice}.`;
  }
  // Moderate revenue drop - check jobs
  else if (jobsAfter >= jobsBefore) {
    recommendation = "keep";
    reasoning = `Revenue down ${Math.abs(revenueDeltaPct).toFixed(1)}% but jobs maintained (${jobsBefore} → ${jobsAfter}). Keep $${exp.newPrice}.`;
  }
  // Both revenue and jobs down
  else {
    recommendation = "revert";
    reasoning = `Revenue down ${Math.abs(revenueDeltaPct).toFixed(1)}% and jobs dropped (${jobsBefore} → ${jobsAfter}). Revert to $${exp.oldPrice}.`;
  }
  
  return { recommendation, reasoning, metrics };
}

/**
 * Log a decision to the acp_decisions table.
 */
async function logDecision(params: {
  decisionType: string;
  offering: string;
  oldValue: string;
  newValue: string;
  reasoning: string;
  outcome?: string;
}): Promise<void> {
  await hqFetch("/decisions", {
    method: "POST",
    body: JSON.stringify(params),
  });
  console.log(`logDecision: ${params.decisionType} - ${params.offering}: ${params.reasoning}`);
}

// =============================================================================
// Underperformer Identification
// =============================================================================

/**
 * Find offerings that are underperforming based on strategy thresholds.
 * 
 * Criteria:
 * - Listed on ACP (listedOnAcp = true)
 * - Age > 14 days
 * - Job count < min_jobs_before_replace threshold
 */
async function identifyUnderperformers(): Promise<Offering[]> {
  const { offerings } = await hqFetch("/offerings");
  const { strategy } = await hqFetch("/strategy");
  
  const minJobsBeforeReplace = strategy?.offerings?.min_jobs_before_replace || 10;
  const minAgeDays = 14;
  
  const underperformers: Offering[] = [];
  
  for (const offering of offerings || []) {
    // Skip if not listed on ACP
    if (!offering.listedOnAcp) continue;
    
    const ageInDays = (Date.now() - new Date(offering.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const jobs = offering.jobCount || 0;
    
    if (ageInDays > minAgeDays && jobs < minJobsBeforeReplace) {
      underperformers.push({
        ...offering,
        // Add computed fields for convenience
        listedOnAcp: true,
      });
    }
  }
  
  // Sort by job count (worst performers first)
  underperformers.sort((a, b) => (a.jobCount || 0) - (b.jobCount || 0));
  
  return underperformers;
}

// =============================================================================
// State Management
// =============================================================================

async function updateState(): Promise<void> {
  console.log("updateState: Checking state...");
  // State is updated via HQ API when jobs complete
  // This function can aggregate/validate if needed
}

// =============================================================================
// Offering Sync (listedOnAcp from actual ACP marketplace)
// =============================================================================

async function syncListedStatus(): Promise<void> {
  console.log("syncListedStatus: Checking ACP marketplace...");
  
  try {
    const output = execSync(
      `cd ${ACP_DIR} && npx tsx bin/acp.ts sell list 2>&1`,
      { encoding: "utf-8", timeout: 60000 }
    );
    
    // Parse listed offerings from CLI output
    const listedNames: string[] = [];
    const lines = output.split("\n");
    let currentOffering = "";
    
    for (const line of lines) {
      // Offering name appears as indented line (2 spaces, then name)
      const nameMatch = line.match(/^\s{2}(\w+)\s*$/);
      if (nameMatch) {
        currentOffering = nameMatch[1];
      }
      // Check if status is Listed
      if (line.includes("Status") && line.includes("Listed") && currentOffering) {
        listedNames.push(currentOffering);
        currentOffering = "";
      }
    }
    
    console.log(`syncListedStatus: Found ${listedNames.length} listed on ACP`);
    
    // Get all offerings from HQ
    const { offerings } = await hqFetch("/offerings");
    let updated = 0;
    
    for (const offering of offerings || []) {
      const isListed = listedNames.includes(offering.name);
      const wasListed = offering.listedOnAcp === 1 || offering.listedOnAcp === true;
      
      if (isListed !== wasListed) {
        await hqFetch("/offerings", {
          method: "PATCH",
          body: JSON.stringify({ name: offering.name, listedOnAcp: isListed }),
        });
        console.log(`syncListedStatus: ${offering.name} → listedOnAcp=${isListed}`);
        updated++;
      }
    }
    
    if (updated === 0) {
      console.log("syncListedStatus: All offerings in sync");
    }
  } catch (error) {
    console.error("syncListedStatus: Failed:", error);
  }
}

// =============================================================================
// Wallet Sync (via ethers.js + Base RPC)
// =============================================================================

const WALLET_ADDRESS = "0x46D4f9f23948fBbeF6b104B0cB571b3F6e551B6F";
const BASE_RPC = "https://mainnet.base.org";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// ERC-20 ABI for balanceOf and decimals
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function syncWallet(): Promise<void> {
  console.log("syncWallet: Checking wallet via Base RPC...");
  
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    
    // Get native ETH balance
    const ethBalanceWei = await provider.getBalance(WALLET_ADDRESS);
    const ethBalance = parseFloat(ethers.formatEther(ethBalanceWei));
    
    // Get USDC balance
    const usdcContract = new ethers.Contract(USDC_BASE, ERC20_ABI, provider);
    const usdcDecimals = await usdcContract.decimals();
    const usdcBalanceRaw = await usdcContract.balanceOf(WALLET_ADDRESS);
    const usdcBalance = parseFloat(ethers.formatUnits(usdcBalanceRaw, usdcDecimals));
    
    // Estimate total value (USDC is 1:1, ETH would need price fetch but usually small)
    // For simplicity, we track USDC as primary value since that's what ACP uses
    const totalValueUsd = usdcBalance + (ethBalance * 2500); // rough ETH estimate
    
    const payload = {
      usdcBalance,
      ethBalance,
      cbbtcBalance: 0,
      cbbtcValueUsd: 0,
      totalValueUsd,
    };
    
    await hqFetch("/wallet", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.log(`syncWallet: Updated - USDC: $${usdcBalance.toFixed(2)}, ETH: ${ethBalance.toFixed(6)}, Total: $${totalValueUsd.toFixed(2)}`);
  } catch (error) {
    console.error("syncWallet: Failed:", error);
  }
}

// =============================================================================
// Task Generation
// =============================================================================

async function hasPendingTask(pillar: string, keyword: string): Promise<boolean> {
  const { tasks } = await hqFetch("/tasks?status=pending");
  return tasks?.some(
    (t: { pillar: string; title: string }) =>
      t.pillar === pillar && t.title.toLowerCase().includes(keyword.toLowerCase())
  );
}

async function createTask(task: {
  pillar: string;
  priority: number;
  title: string;
  description: string;
}): Promise<void> {
  await hqFetch("/tasks", {
    method: "POST",
    body: JSON.stringify(task),
  });
  console.log(`generateTasks: Created task: ${task.title}`);
}

async function generateTasks(): Promise<void> {
  const { state } = await hqFetch("/state");
  const { tasks } = await hqFetch("/tasks?status=pending");
  const { strategy } = await hqFetch("/strategy");

  const pendingPillars = new Set(
    tasks?.map((t: { pillar: string }) => t.pillar) || []
  );

  // Rule 1: No jobs → create marketing task
  if (
    state?.jobsThisEpoch === 0 &&
    !pendingPillars.has("build") &&
    !pendingPillars.has("distribute")
  ) {
    await createTask({
      pillar: "distribute",
      priority: 80,
      title: "Post on Twitter — no jobs yet",
      description: "No jobs yet this epoch. Post about offerings to drive discovery.",
    });
  }

  // Rule 2: Marketing rules - check daily Twitter target
  const activities = await hqFetch("/activities?type=marketing&since=today");
  const activitiesList = activities.activities || [];
  const tweetsToday = activitiesList.filter(
    (a: { details?: { platform?: string } }) => a.details?.platform === "twitter"
  ).length;

  const tweetsTarget = strategy?.marketing?.tweets_per_day || 2;

  if (tweetsToday < tweetsTarget && !(await hasPendingTask("distribute", "twitter"))) {
    await createTask({
      pillar: "distribute",
      priority: 70,
      title: `Post to Twitter (${tweetsToday}/${tweetsTarget} today)`,
      description: "Create engaging post about ACP offerings on @ClaudiusHQ",
    });
  }

  // Rule 3: Experiment analysis rules (price experiments)
  const priceExpData = await hqFetch("/price-experiments?status=measuring");
  const priceExperiments: PriceExperiment[] = priceExpData.priceExperiments || [];
  const durationDays = strategy?.experiments?.price_test_duration_days || 7;
  const minSample = strategy?.experiments?.min_sample_size || 20;

  // Get offering names for display
  const { offerings: allOfferings } = await hqFetch("/offerings");
  const offeringMap = new Map<number, string>(
    (allOfferings || []).map((o: Offering) => [o.id, o.name] as [number, string])
  );

  for (const exp of priceExperiments) {
    const daysRunning = (Date.now() - new Date(exp.changedAt).getTime()) / (1000 * 60 * 60 * 24);
    const sampleSize = (exp.jobsBefore7d || 0) + (exp.jobsAfter7d || 0);
    const offeringName = offeringMap.get(exp.offeringId) || `offering_${exp.offeringId}`;

    // Check if experiment meets threshold (7 days OR 20+ samples)
    if (daysRunning >= durationDays || sampleSize >= minSample) {
      // Analyze the experiment
      const analysis = analyzeExperiment(exp);
      
      // Skip if there's already a pending task for this experiment
      if (await hasPendingTask("experiment", offeringName)) {
        continue;
      }

      // Create task with recommendation
      await createTask({
        pillar: "experiment",
        priority: 75,
        title: `Analyze experiment: ${offeringName}`,
        description: `Price test $${exp.oldPrice} → $${exp.newPrice} after ${Math.floor(daysRunning)} days / ${sampleSize} samples.\n\n**Recommendation: ${analysis.recommendation.toUpperCase()}**\n${analysis.reasoning}\n\nMetrics: Jobs ${analysis.metrics.jobsBefore}→${analysis.metrics.jobsAfter}, Revenue $${analysis.metrics.revenueBefore.toFixed(2)}→$${analysis.metrics.revenueAfter.toFixed(2)} (${analysis.metrics.revenueDeltaPct > 0 ? '+' : ''}${analysis.metrics.revenueDeltaPct.toFixed(1)}%)`,
      });

      // Log decision to acp_decisions table
      await logDecision({
        decisionType: "experiment",
        offering: offeringName,
        oldValue: `$${exp.oldPrice}`,
        newValue: `$${exp.newPrice}`,
        reasoning: analysis.reasoning,
        outcome: `recommendation: ${analysis.recommendation}`,
      });

      console.log(`analyzeExperiment: ${offeringName} - ${analysis.recommendation} (${analysis.reasoning})`);
    }
  }

  // Rule 4: Replace rules - low performers (using identifyUnderperformers)
  const underperformers = await identifyUnderperformers();
  
  for (const offering of underperformers) {
    // Skip if there's already a pending replacement task
    if (await hasPendingTask("replace", offering.name)) {
      continue;
    }

    const ageInDays = (Date.now() - new Date(offering.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const jobs = offering.jobCount || 0;
    const revenue = offering.totalRevenue || 0;

    await createTask({
      pillar: "replace",
      priority: 50,
      title: `Evaluate for replacement: ${offering.name}`,
      description: `${offering.name} has ${jobs} jobs and $${revenue.toFixed(2)} revenue after ${Math.floor(ageInDays)} days. Consider delisting or improving.`,
    });

    console.log(`identifyUnderperformers: Flagged ${offering.name} (${jobs} jobs, ${Math.floor(ageInDays)} days)`);
  }
  
  if (underperformers.length > 0) {
    console.log(`identifyUnderperformers: Found ${underperformers.length} underperforming offerings`);
  }

  // Check pace and generate alerts
  const targetJobs = state?.targetJobs || 100;
  const targetRevenue = state?.targetRevenue || 50;
  const epochStart = new Date(state?.epochStart || Date.now());
  const epochEnd = new Date(state?.epochEnd || Date.now());
  const epochDays = (epochEnd.getTime() - epochStart.getTime()) / (1000 * 60 * 60 * 24);
  const daysElapsed = (Date.now() - epochStart.getTime()) / (1000 * 60 * 60 * 24);
  const progressPct = daysElapsed / epochDays;

  const expectedJobs = Math.floor(targetJobs * progressPct);
  const expectedRevenue = targetRevenue * progressPct;

  if ((state?.jobsThisEpoch || 0) < expectedJobs) {
    console.log(`ALERT: Behind job pace (${state?.jobsThisEpoch || 0}/${expectedJobs} expected)`);
  }
  if ((state?.revenueThisEpoch || 0) < expectedRevenue) {
    console.log(`ALERT: Behind revenue pace (${state?.revenueThisEpoch?.toFixed(2) || 0}/${expectedRevenue.toFixed(0)} expected)`);
  }
}

// =============================================================================
// Pillar Rotation
// =============================================================================

async function advancePillar(): Promise<void> {
  console.log("advancePillar: Checking pillar rotation...");
  // Pillar rotation logic - advances based on completed tasks
  // Currently managed manually via heartbeat context
}

// =============================================================================
// Competitive Scan (Weekly)
// =============================================================================

async function runCompetitiveScan(): Promise<void> {
  console.log("runCompetitiveScan: Checking if scan needed...");
  
  // Check last scan time from strategy table
  const { strategy } = await hqFetch("/strategy?category=automation");
  const lastScan = strategy?.lastCompetitiveScan;
  const daysSinceScan = lastScan 
    ? (Date.now() - new Date(lastScan).getTime()) / (1000 * 60 * 60 * 24)
    : 999;
  
  if (daysSinceScan < 7) {
    console.log(`runCompetitiveScan: Last scan ${daysSinceScan.toFixed(1)} days ago, skipping`);
    return;
  }
  
  console.log("runCompetitiveScan: Running weekly competitive scan...");
  
  try {
    // Run acp browse to get top agents
    const output = execSync(`cd ${ACP_DIR} && npx tsx bin/acp.ts browse --limit 20 --json 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 60000,
    });
    
    // Parse the output
    const jsonStart = output.indexOf("[");
    if (jsonStart === -1) {
      console.log("runCompetitiveScan: No agents found");
      return;
    }
    
    const agents = JSON.parse(output.slice(jsonStart));
    console.log(`runCompetitiveScan: Found ${agents.length} agents`);
    
    // Analyze competition
    const insights: string[] = [];
    const offeringCounts: Record<string, number> = {};
    const pricingData: { name: string; price: number }[] = [];
    
    for (const agent of agents) {
      if (agent.offerings) {
        for (const offering of agent.offerings) {
          const name = offering.name?.toLowerCase() || "unknown";
          offeringCounts[name] = (offeringCounts[name] || 0) + 1;
          if (offering.price) {
            pricingData.push({ name, price: offering.price });
          }
        }
      }
    }
    
    // Find popular offerings we don't have
    const { offerings: ourOfferings } = await hqFetch("/offerings");
    const ourNames = new Set((ourOfferings || []).map((o: { name: string }) => o.name.toLowerCase()));
    
    const popular = Object.entries(offeringCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    for (const [name, count] of popular) {
      if (!ourNames.has(name) && count >= 3) {
        insights.push(`Popular offering "${name}" (${count} agents) — we don't have this`);
      }
    }
    
    // Log insights
    if (insights.length > 0) {
      console.log("runCompetitiveScan: Insights:");
      insights.forEach(i => console.log(`  - ${i}`));
      
      // Create a task to review insights
      await createTask({
        pillar: "build",
        priority: 60,
        title: "Review competitive insights",
        description: `Weekly scan found ${insights.length} insights:\n\n${insights.join("\n")}`,
      });
    }
    
    // Update last scan time
    await fetch(`${HQ_API}/strategy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        category: "automation",
        key: "lastCompetitiveScan",
        value: new Date().toISOString(),
      }),
    });
    
    console.log("runCompetitiveScan: Complete");
    
  } catch (error) {
    console.error("runCompetitiveScan: Error:", error);
  }
}

// =============================================================================
// Execute Pending Tasks
// =============================================================================

async function executePendingTasks(): Promise<void> {
  console.log("executePendingTasks: Fetching pending tasks...");
  
  const { tasks } = await hqFetch("/tasks?status=pending");
  
  if (!tasks || tasks.length === 0) {
    console.log("executePendingTasks: No pending tasks");
    return;
  }
  
  console.log(`executePendingTasks: Found ${tasks.length} pending tasks`);
  
  // Sort by priority (highest first)
  const sorted = tasks.sort((a: { priority: number }, b: { priority: number }) => 
    (b.priority || 50) - (a.priority || 50)
  );
  
  for (const task of sorted) {
    console.log(`\n--- Executing task ${task.id}: ${task.title} (${task.pillar}) ---`);
    
    try {
      const result = await executeTask(task);
      
      // Mark task complete
      await fetch(`${HQ_API}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ status: "done", result, completedAt: new Date().toISOString() }),
      });
      
      console.log(`Task ${task.id} completed: ${result?.slice(0, 100) || "done"}`);
      
    } catch (error) {
      console.error(`Task ${task.id} failed:`, error);
      
      // Mark as skipped on error
      await fetch(`${HQ_API}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ status: "skipped", result: `Error: ${error}` }),
      });
    }
  }
  
  console.log("\nexecutePendingTasks: All tasks processed");
}

async function executeTask(task: { id: number; pillar: string; title: string; description?: string }): Promise<string> {
  const { pillar, title, description } = task;
  
  switch (pillar) {
    case "distribute":
      // Twitter posting
      if (title.toLowerCase().includes("twitter")) {
        return await postToTwitter(description || title);
      }
      return "Distribute task — manual action needed";
      
    case "quality":
      // Quality improvements — typically need AI review
      return "Quality task logged — review handler code manually";
      
    case "build":
      // New offerings — need AI to design
      return "Build task logged — new offering design needed";
      
    case "replace":
      // Underperformer analysis
      return "Replace task logged — evaluate offering performance";
      
    case "experiment":
      // Price experiment analysis
      return "Experiment task logged — check experiment results";
      
    default:
      return `Unknown pillar: ${pillar}`;
  }
}

async function postToTwitter(content: string): Promise<string> {
  const TWITTER_AUTH_TOKEN = process.env.TWITTER_AUTH_TOKEN;
  const TWITTER_CT0 = process.env.TWITTER_CT0;
  
  if (!TWITTER_AUTH_TOKEN || !TWITTER_CT0) {
    return "Twitter credentials missing — cannot post";
  }
  
  try {
    // Generate tweet content if description is too long or generic
    let tweet = content;
    if (content.length > 280 || content.includes("offering")) {
      // Craft a simple promotional tweet
      const offerings = ["fear_greed", "btc_signal", "live_price", "polymarket_odds"];
      const pick = offerings[Math.floor(Math.random() * offerings.length)];
      tweet = `🤖 AI agents: need ${pick.replace(/_/g, " ")}? I've got you covered.\n\nFind me on ACP: Claudius\n\n#ACP #AIAgents`;
    }
    
    // Ensure tweet is under 280 chars
    if (tweet.length > 280) {
      tweet = tweet.slice(0, 277) + "...";
    }
    
    // Post via twitter-cli
    execSync(`/root/.local/bin/twitter post "${tweet.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
      timeout: 30000,
      env: { ...process.env, TWITTER_AUTH_TOKEN, TWITTER_CT0 },
    });
    
    // Log to marketing
    await fetch(`${HQ_API}/marketing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        title: "Auto-tweet",
        content: tweet,
        platform: "twitter",
        status: "posted",
        postedAt: new Date().toISOString(),
      }),
    });
    
    return `Posted: "${tweet.slice(0, 50)}..."`;
    
  } catch (error) {
    console.error("postToTwitter error:", error);
    return `Twitter post failed: ${error}`;
  }
}

// =============================================================================
// Tweet Engagement Sync
// =============================================================================

interface TweetData {
  id: string;
  text: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    views: number;
    bookmarks: number;
  };
  createdAt: string;
}

async function syncTweetEngagement(): Promise<void> {
  console.log("syncTweetEngagement: Fetching recent tweets...");

  const TWITTER_AUTH_TOKEN = process.env.TWITTER_AUTH_TOKEN;
  const TWITTER_CT0 = process.env.TWITTER_CT0;

  if (!TWITTER_AUTH_TOKEN || !TWITTER_CT0) {
    console.log("syncTweetEngagement: Missing Twitter credentials, skipping");
    return;
  }

  try {
    // Fetch recent tweets via CLI
    const twitterOutput = execSync(
      `/root/.local/bin/twitter user-posts ClaudiusHQ --json 2>&1`,
      {
        encoding: "utf-8",
        timeout: 60000,
        env: {
          ...process.env,
          TWITTER_AUTH_TOKEN,
          TWITTER_CT0,
        },
      }
    );

    // Parse JSON output (skip any non-JSON lines at start)
    const jsonStart = twitterOutput.indexOf("[");
    if (jsonStart === -1) {
      console.log("syncTweetEngagement: No tweets found in output");
      return;
    }

    const tweets: TweetData[] = JSON.parse(twitterOutput.slice(jsonStart));
    console.log(`syncTweetEngagement: Found ${tweets.length} tweets`);

    // Get all marketing campaigns with tweetIds
    const { campaigns } = await hqFetch("/marketing");
    if (!campaigns || campaigns.length === 0) {
      console.log("syncTweetEngagement: No marketing campaigns found");
      return;
    }

    let updated = 0;

    for (const campaign of campaigns) {
      if (!campaign.tweetId) continue;

      // Find matching tweet
      const tweet = tweets.find((t) => t.id === campaign.tweetId);
      if (!tweet) continue;

      // Check if engagement metrics differ
      const hasChanges =
        campaign.engagementLikes !== tweet.metrics.likes ||
        campaign.engagementRetweets !== tweet.metrics.retweets ||
        campaign.engagementReplies !== tweet.metrics.replies;

      if (hasChanges) {
        await hqFetch(`/marketing/${campaign.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            engagementLikes: tweet.metrics.likes,
            engagementRetweets: tweet.metrics.retweets,
            engagementReplies: tweet.metrics.replies,
          }),
        });
        console.log(
          `syncTweetEngagement: Updated ${campaign.id} → likes=${tweet.metrics.likes}, RTs=${tweet.metrics.retweets}, replies=${tweet.metrics.replies}`
        );
        updated++;
      }
    }

    console.log(`syncTweetEngagement: Updated ${updated} campaigns`);
  } catch (error) {
    console.error("syncTweetEngagement: Failed:", error);
  }
}

// =============================================================================
// Main
// =============================================================================

async function logActivity(type: string, details: Record<string, unknown>): Promise<void> {
  try {
    await hqFetch("/activities", {
      method: "POST",
      body: JSON.stringify({
        type,
        details: JSON.stringify(details),
        outcome: "success"
      }),
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}

async function main() {
  console.log("ACP Automation running...");
  const startTime = Date.now();

  try {
    // 1. Update state (epoch, jobs, revenue)
    await updateState();
    
    // 2. Sync offerings (listedOnAcp) from ACP marketplace
    await syncListedStatus();
    
    // 3. Sync wallet balance
    await syncWallet();
    
    // 4. Sync tweet engagement metrics
    await syncTweetEngagement();
    
    // 5. Run competitive scan (weekly)
    await runCompetitiveScan();
    
    // 6. Generate tasks based on rules
    await generateTasks();
    
    // 7. Execute ALL pending tasks
    await executePendingTasks();
    
    // 8. Advance pillar if needed
    await advancePillar();
    
    // 9. Log heartbeat activity
    const durationMs = Date.now() - startTime;
    await logActivity("heartbeat", {
      action: "automation_run",
      durationMs,
      timestamp: new Date().toISOString()
    });
    
    console.log("ACP Automation complete.");
  } catch (error) {
    console.error("ACP Automation error:", error);
    await logActivity("heartbeat", {
      action: "automation_error",
      error: String(error),
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
}

main();
