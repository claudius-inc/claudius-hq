/**
 * ACP Automation Script — Consolidated
 * 
 * Runs every 30m via cron. Handles:
 * 1. State updates (epoch progress, alerts)
 * 2. Task generation (marketing, experiments, replace)
 * 3. Offering sync (listedOnAcp status from ACP marketplace)
 * 4. Wallet sync
 * 5. Pillar rotation
 */

import { config } from "dotenv";
import { execSync } from "child_process";

config({ path: ".env.local" });

const HQ_API = "https://claudiusinc.com/api/acp";
const API_KEY = process.env.HQ_API_KEY;
const ACP_DIR = "/root/.openclaw/workspace/skills/acp";

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
// Wallet Sync
// =============================================================================

async function syncWallet(): Promise<void> {
  console.log("syncWallet: Checking wallet...");
  
  try {
    const output = execSync(
      `cd ${ACP_DIR} && npx tsx bin/acp.ts wallet balance 2>&1`,
      { encoding: "utf-8", timeout: 30000 }
    );
    
    // Parse wallet balance from output
    // Example: "USDC: 14.89" or "Total: $19.54"
    const usdcMatch = output.match(/USDC[:\s]+\$?([\d.]+)/i);
    const cbbtcMatch = output.match(/cbBTC[:\s]+\$?([\d.]+)/i);
    const totalMatch = output.match(/Total[:\s]+\$?([\d.]+)/i);
    
    if (usdcMatch || totalMatch) {
      const payload = {
        usdcBalance: usdcMatch ? parseFloat(usdcMatch[1]) : 0,
        ethBalance: 0,
        cbbtcBalance: 0,
        cbbtcValueUsd: cbbtcMatch ? parseFloat(cbbtcMatch[1]) : 0,
        totalValueUsd: totalMatch ? parseFloat(totalMatch[1]) : 0,
      };
      
      await hqFetch("/wallet", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      console.log(`syncWallet: Updated - $${payload.totalValueUsd} total`);
    }
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

  // Rule 3: Experiment analysis rules
  const experimentsData = await hqFetch("/experiments?status=running");
  const experiments = experimentsData.experiments || [];
  const durationDays = strategy?.experiments?.price_test_duration_days || 7;
  const minSample = strategy?.experiments?.min_sample_size || 20;

  for (const exp of experiments) {
    const daysRunning =
      (Date.now() - new Date(exp.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const sampleSize = (exp.jobsOld || 0) + (exp.jobsNew || 0);

    if (
      (daysRunning >= durationDays || sampleSize >= minSample) &&
      !(await hasPendingTask("experiment", exp.offeringName))
    ) {
      await createTask({
        pillar: "experiment",
        priority: 75,
        title: `Analyze experiment: ${exp.offeringName}`,
        description: `Price test ${exp.oldPrice} → ${exp.newPrice} has ${Math.floor(daysRunning)} days / ${sampleSize} samples. Decide: keep or revert.`,
      });
    }
  }

  // Rule 4: Replace rules - low performers
  const { offerings } = await hqFetch("/offerings");
  const minJobsBeforeReplace = strategy?.offerings?.min_jobs_before_replace || 10;

  for (const offering of offerings || []) {
    if (!offering.listedOnAcp) continue;

    const ageInDays =
      (Date.now() - new Date(offering.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const jobs = offering.jobCount || 0;

    if (
      ageInDays > 14 &&
      jobs < minJobsBeforeReplace &&
      !(await hasPendingTask("replace", offering.name))
    ) {
      await createTask({
        pillar: "replace",
        priority: 50,
        title: `Evaluate for replacement: ${offering.name}`,
        description: `${offering.name} has ${jobs} jobs after ${Math.floor(ageInDays)} days. Consider delisting or improving.`,
      });
    }
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
// Main
// =============================================================================

async function main() {
  console.log("ACP Automation running...");

  try {
    // 1. Update state
    await updateState();
    
    // 2. Sync offerings (listedOnAcp) from ACP marketplace
    await syncListedStatus();
    
    // 3. Sync wallet balance
    await syncWallet();
    
    // 4. Generate tasks based on rules
    await generateTasks();
    
    // 5. Advance pillar if needed
    await advancePillar();
    
    console.log("ACP Automation complete.");
  } catch (error) {
    console.error("ACP Automation error:", error);
    process.exit(1);
  }
}

main();
