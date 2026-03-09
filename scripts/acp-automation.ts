// scripts/acp-automation.ts
// Runs every 30 minutes via cron (no AI needed)
// Collects metrics, generates tasks, advances pillar rotation, syncs offerings

import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
config({ path: '.env.local' });

const HQ_API = 'https://claudiusinc.com/api/acp';
const API_KEY = process.env.HQ_API_KEY;

if (!API_KEY) {
  console.error('HQ_API_KEY not found in environment');
  process.exit(1);
}

interface HQResponse<T = unknown> {
  success?: boolean;
  error?: string;
  state?: T;
  tasks?: T[];
  experiments?: T[];
  metrics?: T[];
}

interface ACPState {
  id: string;
  currentPillar: string;
  currentEpoch: number;
  jobsThisEpoch: number;
  revenueThisEpoch: number;
  epochStartDate: string;
  epochEndDate: string;
}

interface ACPTask {
  id: string;
  pillar: string;
  status: string;
  title: string;
  description: string;
  priority: number;
  createdAt: string;
}

interface ACPExperiment {
  id: string;
  name: string;
  status: string;
  startedAt: string;
}

async function hqFetch<T = unknown>(endpoint: string, options?: RequestInit): Promise<HQResponse<T>> {
  try {
    const res = await fetch(`${HQ_API}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error(`API error ${res.status}: ${text}`);
      return { error: text };
    }
    
    return await res.json();
  } catch (err) {
    console.error('Fetch error:', err);
    return { error: String(err) };
  }
}

// --- Offerings Sync ---

const OFFERINGS_DIR = '/root/.openclaw/workspace/skills/acp/src/seller/offerings';

interface OfferingJson {
  name: string;
  description?: string;
  jobFee?: number;
  listed?: boolean;
}

function detectCategory(name: string): string {
  const marketDataOfferings = [
    'btc_signal', 'eth_signal', 'fear_greed', 'live_price', 
    'technical_signals', 'market_sentiment', 'funding_rate_signal',
    'price_volatility_alert', 'portfolio_heat_map'
  ];
  const utilityOfferings = ['quick_swap', 'gas_tracker', 'research_summarizer'];
  const securityOfferings = ['token_risk_analyzer', 'token_safety_quick'];
  const fortuneOfferings = [
    'daily_horoscope', 'zodiac_fortune', 'i_ching', 
    'rune_cast', 'dice_oracle', 'lucky_numbers', 'compatibility_check'
  ];
  const entertainmentOfferings = ['agent_roast'];
  const weatherOfferings = ['weather_now'];

  if (marketDataOfferings.includes(name)) return 'market_data';
  if (utilityOfferings.includes(name)) return 'utility';
  if (securityOfferings.includes(name)) return 'security';
  if (fortuneOfferings.includes(name)) return 'fortune';
  if (entertainmentOfferings.includes(name)) return 'entertainment';
  if (weatherOfferings.includes(name)) return 'weather';
  return 'other';
}

async function syncOfferings(): Promise<void> {
  if (!fs.existsSync(OFFERINGS_DIR)) {
    console.log('syncOfferings: Offerings directory not found');
    return;
  }

  const offerings: Array<{
    name: string;
    description: string;
    price: number;
    category: string;
    isActive: number;
  }> = [];

  const dirs = fs.readdirSync(OFFERINGS_DIR);
  
  for (const dir of dirs) {
    const jsonPath = path.join(OFFERINGS_DIR, dir, 'offering.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const data: OfferingJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        offerings.push({
          name: data.name,
          description: (data.description || '').substring(0, 500),
          price: data.jobFee || 0,
          category: detectCategory(data.name),
          isActive: data.listed ? 1 : 0,
        });
      } catch (err) {
        console.error(`syncOfferings: Failed to parse ${jsonPath}:`, err);
      }
    }
  }

  if (offerings.length === 0) {
    console.log('syncOfferings: No offerings found');
    return;
  }

  // Use existing POST endpoint which upserts
  const result = await hqFetch('/offerings', {
    method: 'POST',
    body: JSON.stringify({ offerings }),
  });

  if (result.error) {
    console.error('syncOfferings: Failed to sync:', result.error);
  } else {
    console.log(`syncOfferings: Synced ${offerings.length} offerings to HQ`);
  }
}

// --- Metrics Collection ---

async function collectMetrics(): Promise<void> {
  // Fetch job counts from ACP seller server logs or API
  // For now, this is a placeholder - actual ACP platform integration coming
  // The seller server logs jobs to its own endpoint which we'll parse
  
  // TODO: Integrate with actual ACP platform API when available
  // For now, metrics are logged manually via HQ dashboard or heartbeat
  console.log('collectMetrics: Placeholder (manual logging via HQ)');
}

async function updateState(): Promise<void> {
  // Fetch recent metrics and sum them
  const response = await hqFetch<{ name: string; value: string }[]>('/metrics?period=epoch');
  
  if (response.error || !response.metrics) {
    console.log('updateState: No metrics to aggregate');
    return;
  }
  
  // Sum up jobs and revenue from metrics
  let jobsThisEpoch = 0;
  let revenueThisEpoch = 0;
  
  for (const metric of response.metrics) {
    if (metric.name === 'jobs_completed') {
      jobsThisEpoch += parseFloat(metric.value) || 0;
    } else if (metric.name === 'revenue_virtuals') {
      revenueThisEpoch += parseFloat(metric.value) || 0;
    }
  }
  
  // Only update if we have non-zero values
  if (jobsThisEpoch > 0 || revenueThisEpoch > 0) {
    await hqFetch('/state', {
      method: 'PATCH',
      body: JSON.stringify({ jobsThisEpoch, revenueThisEpoch }),
    });
    console.log(`updateState: jobs=${jobsThisEpoch}, revenue=${revenueThisEpoch}`);
  }
}

async function generateTasks(): Promise<void> {
  const stateResponse = await hqFetch<ACPState>('/state');
  const tasksResponse = await hqFetch<ACPTask>('/tasks?status=pending');
  
  if (!stateResponse.state) {
    console.error('generateTasks: Could not fetch state');
    return;
  }
  
  const state = stateResponse.state;
  const tasks = tasksResponse.tasks || [];
  const pendingPillars = new Set(tasks.map((t: ACPTask) => t.pillar));
  const newTasks: { pillar: string; priority: number; title: string; description: string }[] = [];

  // Rule 1: No jobs in epoch + no build task → create marketing/build task
  // Note: Marketing activities fall under "build" pillar (building audience)
  if (state.jobsThisEpoch === 0 && !pendingPillars.has('build')) {
    newTasks.push({
      pillar: 'build',
      priority: 80,
      title: 'Market offerings on ACP Discord/Twitter',
      description: 'No jobs this epoch. Post about our offerings to drive discovery.',
    });
  }

  // Rule 2: We have jobs but no quality task → create quality check
  if (state.jobsThisEpoch > 0 && !pendingPillars.has('quality')) {
    newTasks.push({
      pillar: 'quality',
      priority: 70,
      title: 'Review recent job deliveries',
      description: `${state.jobsThisEpoch} jobs this epoch. Check that they delivered correctly.`,
    });
  }

  // Rule 3: Experiment running > 7 days → create analysis task
  const expResponse = await hqFetch<ACPExperiment>('/experiments?status=running');
  const experiments = expResponse.experiments || [];
  
  for (const exp of experiments) {
    const daysRunning = (Date.now() - new Date(exp.startedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysRunning > 7) {
      // Check if we already have an analysis task for this experiment
      const hasAnalysisTask = tasks.some(
        (t: ACPTask) => t.pillar === 'experiment' && t.title.includes(exp.name)
      );
      
      if (!hasAnalysisTask) {
        newTasks.push({
          pillar: 'experiment',
          priority: 75,
          title: `Analyze experiment: ${exp.name}`,
          description: `Experiment running ${Math.floor(daysRunning)} days. Review results and decide.`,
        });
      }
    }
  }

  // Create new tasks
  for (const task of newTasks) {
    const result = await hqFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
    
    if (result.error) {
      console.error(`Failed to create task: ${task.title}`);
    } else {
      console.log(`Created task: ${task.title}`);
    }
  }
  
  if (newTasks.length === 0) {
    console.log('generateTasks: No new tasks needed');
  }
}

async function advancePillar(): Promise<void> {
  const stateResponse = await hqFetch<ACPState>('/state');
  const tasksResponse = await hqFetch<ACPTask>('/tasks?status=done&limit=10');
  
  if (!stateResponse.state) {
    console.error('advancePillar: Could not fetch state');
    return;
  }
  
  const state = stateResponse.state;
  const doneTasks = tasksResponse.tasks || [];
  
  // Count recent done tasks by pillar
  const doneCounts: Record<string, number> = {};
  for (const t of doneTasks) {
    doneCounts[t.pillar] = (doneCounts[t.pillar] || 0) + 1;
  }

  // Rotation: quality → build → replace → experiment → quality
  const rotation = ['quality', 'build', 'replace', 'experiment'];
  const currentIdx = rotation.indexOf(state.currentPillar);
  
  if (currentIdx === -1) {
    console.log(`advancePillar: Unknown pillar "${state.currentPillar}", resetting to quality`);
    await hqFetch('/state', {
      method: 'PATCH',
      body: JSON.stringify({ currentPillar: 'quality' }),
    });
    return;
  }
  
  // If 2+ tasks done in current pillar, advance
  const currentPillarDone = doneCounts[state.currentPillar] || 0;
  if (currentPillarDone >= 2) {
    const nextPillar = rotation[(currentIdx + 1) % rotation.length];
    await hqFetch('/state', {
      method: 'PATCH',
      body: JSON.stringify({ currentPillar: nextPillar }),
    });
    console.log(`Advanced pillar: ${state.currentPillar} → ${nextPillar}`);
  } else {
    console.log(`advancePillar: ${currentPillarDone}/2 tasks done in ${state.currentPillar}`);
  }
}

async function main(): Promise<void> {
  console.log(`ACP Automation running at ${new Date().toISOString()}...`);
  
  try {
    await syncOfferings();   // Sync offerings from local files to HQ
    await collectMetrics();
    await updateState();
    await generateTasks();
    await advancePillar();
    console.log('ACP Automation complete.');
  } catch (error) {
    console.error('ACP Automation error:', error);
    process.exit(1);
  }
}

main();
