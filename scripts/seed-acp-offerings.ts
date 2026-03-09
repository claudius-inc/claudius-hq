/**
 * Seed script to populate the new acp_offerings columns from existing offering.json files.
 * 
 * This is a one-time migration script to backfill:
 * - handlerPath
 * - requirements
 * - deliverable
 * - requiredFunds
 * 
 * Run: npx tsx scripts/seed-acp-offerings.ts
 */

import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

config({ path: ".env.local" });

const OFFERINGS_DIR = "/root/.openclaw/workspace/skills/acp/src/seller/offerings";

interface OfferingJson {
  name: string;
  description?: string;
  jobFee?: number;
  jobFeeType?: string;
  requiredFunds?: boolean;
  listed?: boolean;
  acpOnly?: boolean;
  requirement?: Record<string, { type: string; description: string }>;
  deliverable?: string;
}

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const db = drizzle(client, { schema });

  console.log("Starting ACP offerings seed...\n");

  if (!fs.existsSync(OFFERINGS_DIR)) {
    console.error(`Offerings directory not found: ${OFFERINGS_DIR}`);
    process.exit(1);
  }

  const dirs = fs.readdirSync(OFFERINGS_DIR);
  let updated = 0;
  let skipped = 0;
  let created = 0;

  for (const dir of dirs) {
    const jsonPath = path.join(OFFERINGS_DIR, dir, "offering.json");

    if (!fs.existsSync(jsonPath)) {
      console.log(`  ⚠️  ${dir}: No offering.json found, skipping`);
      skipped++;
      continue;
    }

    try {
      const data: OfferingJson = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      const name = data.name;

      // Check if offering exists in DB
      const existing = await db
        .select()
        .from(schema.acpOfferings)
        .where(eq(schema.acpOfferings.name, name))
        .limit(1);

      const requirementsStr = data.requirement ? JSON.stringify(data.requirement) : null;

      if (existing.length > 0) {
        // Update with new fields
        await db
          .update(schema.acpOfferings)
          .set({
            handlerPath: dir,
            requirements: requirementsStr,
            deliverable: data.deliverable || null,
            requiredFunds: data.requiredFunds ? 1 : 0,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.acpOfferings.name, name));

        console.log(`  ✅ ${name}: Updated with handlerPath=${dir}`);
        updated++;
      } else {
        // Create new offering
        await db.insert(schema.acpOfferings).values({
          name: data.name,
          description: (data.description || "").substring(0, 500),
          price: data.jobFee || 0,
          category: detectCategory(data.name),
          isActive: data.listed ? 1 : 0,
          handlerPath: dir,
          requirements: requirementsStr,
          deliverable: data.deliverable || null,
          requiredFunds: data.requiredFunds ? 1 : 0,
        });

        console.log(`  ➕ ${name}: Created new entry`);
        created++;
      }
    } catch (err) {
      console.error(`  ❌ ${dir}: Failed to process - ${err}`);
      skipped++;
    }
  }

  console.log(`\nSeed complete:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);

  client.close();
}

function detectCategory(name: string): string {
  const marketData = [
    "btc_signal", "eth_signal", "fear_greed", "live_price", "technical_signals",
    "market_sentiment", "funding_rate_signal", "portfolio_heat_map", "price_volatility_alert"
  ];
  const utility = ["quick_swap", "gas_tracker", "research_summarizer"];
  const security = ["token_risk_analyzer", "token_safety_quick"];
  const weather = ["weather_now"];
  const entertainment = ["agent_roast"];

  if (marketData.includes(name)) return "market_data";
  if (utility.includes(name)) return "utility";
  if (security.includes(name)) return "security";
  if (weather.includes(name)) return "weather";
  if (entertainment.includes(name)) return "entertainment";
  return "fortune";
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
