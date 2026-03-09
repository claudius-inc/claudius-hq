import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

config({ path: '.env.local' });

const HQ_API = 'https://claudiusinc.com/api/acp';
const API_KEY = process.env.HQ_API_KEY;
const OFFERINGS_DIR = '/root/.openclaw/workspace/skills/acp/src/seller/offerings';
const ACP_DIR = '/root/.openclaw/workspace/skills/acp';

interface OfferingJson {
  name: string;
  description?: string;
  jobFee?: number;
}

async function hqFetch(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${HQ_API}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return res.json();
}

function detectCategory(name: string): string {
  const marketData = ['btc_signal', 'eth_signal', 'fear_greed', 'live_price', 'technical_signals', 'market_sentiment', 'funding_rate_signal', 'portfolio_heat_map', 'price_volatility_alert'];
  const utility = ['quick_swap', 'gas_tracker', 'research_summarizer'];
  const security = ['token_risk_analyzer', 'token_safety_quick'];
  const weather = ['weather_now'];
  const entertainment = ['agent_roast'];
  
  if (marketData.includes(name)) return 'market_data';
  if (utility.includes(name)) return 'utility';
  if (security.includes(name)) return 'security';
  if (weather.includes(name)) return 'weather';
  if (entertainment.includes(name)) return 'entertainment';
  return 'fortune';
}

function getListedOfferings(): Set<string> {
  try {
    const output = execSync(`cd ${ACP_DIR} && npx tsx bin/acp.ts sell list 2>&1`, { 
      encoding: 'utf-8',
      timeout: 30000 
    });
    
    const listed = new Set<string>();
    const lines = output.split('\n');
    
    let currentOffering = '';
    for (const line of lines) {
      // Offering name is indented with 2 spaces and is just the name
      const nameMatch = line.match(/^  (\w+)$/);
      if (nameMatch) {
        currentOffering = nameMatch[1];
      }
      // Status line shows "Listed" or "Local only"
      if (line.includes('Status') && line.includes('Listed') && !line.includes('Local')) {
        listed.add(currentOffering);
      }
    }
    
    return listed;
  } catch (err) {
    console.error('getListedOfferings: Failed to run acp sell list:', err);
    return new Set();
  }
}

async function syncOfferings(): Promise<void> {
  if (!fs.existsSync(OFFERINGS_DIR)) {
    console.log('syncOfferings: Offerings directory not found');
    return;
  }

  // Get actually listed offerings from ACP
  const listedOfferings = getListedOfferings();
  console.log(`syncOfferings: Found ${listedOfferings.size} listed offerings: ${[...listedOfferings].join(', ')}`);

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
          isActive: listedOfferings.has(data.name) ? 1 : 0,
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

  const result = await hqFetch('/offerings', {
    method: 'POST',
    body: JSON.stringify({ offerings }),
  });

  if (result.error) {
    console.error('syncOfferings: Failed to sync:', result.error);
  } else {
    const activeCount = offerings.filter(o => o.isActive).length;
    console.log(`syncOfferings: Synced ${offerings.length} offerings (${activeCount} active, ${offerings.length - activeCount} inactive)`);
  }
}

async function updateState(): Promise<void> {
  // Placeholder - would aggregate metrics and update state
  console.log('updateState: Checking state...');
}

async function generateTasks(): Promise<void> {
  const { state } = await hqFetch('/state');
  const { tasks } = await hqFetch('/tasks?status=pending');
  
  const pendingPillars = new Set(tasks?.map((t: { pillar: string }) => t.pillar) || []);
  const newTasks: Array<{ pillar: string; priority: number; title: string; description: string }> = [];

  // Rule 1: No jobs → create marketing/build task
  if (state?.jobsThisEpoch === 0 && !pendingPillars.has('build') && !pendingPillars.has('distribute')) {
    newTasks.push({
      pillar: 'distribute',
      priority: 80,
      title: 'Post on ACP Discord/Twitter',
      description: 'No jobs yet. Post about our offerings to drive discovery.',
    });
  }

  for (const task of newTasks) {
    await hqFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
    console.log(`generateTasks: Created task: ${task.title}`);
  }
}

async function advancePillar(): Promise<void> {
  // Placeholder - would check task completion and rotate pillar
  console.log('advancePillar: Checking pillar rotation...');
}

async function main() {
  console.log('ACP Automation running...');
  
  try {
    await syncOfferings();
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
