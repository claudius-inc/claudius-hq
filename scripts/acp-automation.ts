/**
 * ACP Automation Script
 * 
 * Handles automated tasks for ACP operations.
 * 
 * NOTE: syncOfferings() has been removed. HQ is now the source of truth for offerings.
 * Use the HQ API endpoints to manage offerings:
 * - POST /api/acp/offerings - Create/update offerings
 * - POST /api/acp/offerings/publish - Publish to marketplace
 * - POST /api/acp/offerings/unpublish - Remove from marketplace
 */

import { config } from "dotenv";

config({ path: ".env.local" });

const HQ_API = "https://claudiusinc.com/api/acp";
const API_KEY = process.env.HQ_API_KEY;

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

async function updateState(): Promise<void> {
  // Placeholder - would aggregate metrics and update state
  console.log("updateState: Checking state...");
}

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

  // Rule 1: No jobs → create marketing/build task
  if (
    state?.jobsThisEpoch === 0 &&
    !pendingPillars.has("build") &&
    !pendingPillars.has("distribute")
  ) {
    await createTask({
      pillar: "distribute",
      priority: 80,
      title: "Post on ACP Discord/Twitter",
      description: "No jobs yet. Post about our offerings to drive discovery.",
    });
  }

  // Rule 2: Marketing rules - check daily Twitter targets
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
      description: "Create engaging post about our ACP offerings",
    });
  }

  // Rule 3: Experiment analysis rules
  const experimentsData = await hqFetch("/experiments?status=running");
  const experiments = experimentsData.experiments || [];
  const durationDays = strategy?.experiments?.price_test_duration_days || 7;
  const minSample = strategy?.experiments?.min_sample_size || 20;

  for (const exp of experiments) {
    const daysRunning =
      (Date.now() - new Date(exp.startedAt).getTime()) / (1000 * 60 * 60 * 24);
    const sampleSize = (exp.jobsControl || 0) + (exp.jobsVariant || 0);

    if (daysRunning >= durationDays || sampleSize >= minSample) {
      if (!(await hasPendingTask("experiment", exp.name))) {
        await createTask({
          pillar: "experiment",
          priority: 75,
          title: `Analyze experiment: ${exp.name}`,
          description: `Running ${Math.floor(daysRunning)} days, ${sampleSize} samples. Ready for analysis.`,
        });
      }
    }
  }

  // Rule 4: Goals/Pace checking - console alerts
  if (state?.epochStart && state?.epochEnd) {
    const jobTarget = strategy?.goals?.epoch_job_target || 100;
    const revenueTarget = strategy?.goals?.epoch_revenue_target || 50;

    const epochStart = new Date(state.epochStart);
    const epochEnd = new Date(state.epochEnd);
    const now = new Date();
    const epochDuration = epochEnd.getTime() - epochStart.getTime();
    const epochProgress = epochDuration > 0 
      ? (now.getTime() - epochStart.getTime()) / epochDuration 
      : 0;

    const expectedJobs = jobTarget * epochProgress;
    const expectedRevenue = revenueTarget * epochProgress;

    if (state.jobsThisEpoch < expectedJobs * 0.8) {
      console.log(
        `ALERT: Behind job pace (${state.jobsThisEpoch}/${Math.floor(expectedJobs)} expected)`
      );
    }

    if ((state.revenueThisEpoch || 0) < expectedRevenue * 0.8) {
      console.log(
        `ALERT: Behind revenue pace (${state.revenueThisEpoch || 0}/${Math.floor(expectedRevenue)} expected)`
      );
    }
  }

  // Rule 5: Replace threshold rules - check underperforming offerings
  const offeringsData = await hqFetch("/offerings");
  const minJobs = strategy?.offerings?.min_jobs_before_replace || 10;

  for (const o of offeringsData.offerings || []) {
    if (o.isActive && o.jobCount < minJobs) {
      const age =
        (Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (age > 14 && !(await hasPendingTask("replace", o.name))) {
        await createTask({
          pillar: "replace",
          priority: 50,
          title: `Evaluate ${o.name} for replacement`,
          description: `Only ${o.jobCount} jobs in ${Math.floor(age)} days. Below ${minJobs} threshold.`,
        });
      }
    }
  }
}

async function advancePillar(): Promise<void> {
  // Placeholder - would check task completion and rotate pillar
  console.log("advancePillar: Checking pillar rotation...");
}

async function main() {
  console.log("ACP Automation running...");
  console.log(
    "NOTE: Offering sync removed. HQ is now source of truth for offerings."
  );

  try {
    await updateState();
    await generateTasks();
    await advancePillar();
    console.log("ACP Automation complete.");
  } catch (error) {
    console.error("ACP Automation error:", error);
    process.exit(1);
  }
}

main();
