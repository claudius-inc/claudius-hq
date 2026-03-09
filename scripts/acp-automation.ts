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

async function generateTasks(): Promise<void> {
  const { state } = await hqFetch("/state");
  const { tasks } = await hqFetch("/tasks?status=pending");

  const pendingPillars = new Set(
    tasks?.map((t: { pillar: string }) => t.pillar) || []
  );
  const newTasks: Array<{
    pillar: string;
    priority: number;
    title: string;
    description: string;
  }> = [];

  // Rule 1: No jobs → create marketing/build task
  if (
    state?.jobsThisEpoch === 0 &&
    !pendingPillars.has("build") &&
    !pendingPillars.has("distribute")
  ) {
    newTasks.push({
      pillar: "distribute",
      priority: 80,
      title: "Post on ACP Discord/Twitter",
      description: "No jobs yet. Post about our offerings to drive discovery.",
    });
  }

  for (const task of newTasks) {
    await hqFetch("/tasks", {
      method: "POST",
      body: JSON.stringify(task),
    });
    console.log(`generateTasks: Created task: ${task.title}`);
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
