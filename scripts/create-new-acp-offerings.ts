/**
 * Creates the 3 NEW manifest offerings on V2 marketplace by POSTing to
 *   /agents/{agentId}/offerings
 *
 * Reads offering.json from skills/acp/src/seller/offerings/<name>/ and pushes
 * the V2-shaped payload directly. Skips any offering that already exists.
 *
 * Default mode: dry-run. To actually create:
 *   APPLY=1 npx tsx --env-file=.env.local scripts/create-new-acp-offerings.ts
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { v2AuthenticatedFetch } from "../src/lib/v2-auth";
import { getV2AgentInfo } from "../src/lib/virtuals-client";
import { ACP_OFFERING_MANIFEST } from "../src/config/acp-offerings-manifest";

const AGENT_ID =
  process.env.ACP_V2_AGENT_ID || "019dc9e1-8f53-79db-9f05-5889a0f8ef4a";
const OFFERINGS_ROOT = "/root/.openclaw/workspace/skills/acp/src/seller/offerings";

const NEW_OFFERINGS = ["tx_simulate", "abi_decode", "url_reader"];

interface OfferingJson {
  name: string;
  description: string;
  jobFee: number;
  jobFeeType: "fixed" | "percentage";
  requiredFunds: boolean;
  slaMinutes?: number;
  requirement?: Record<string, unknown>;
  deliverable?: string | Record<string, unknown>;
}

async function main() {
  const apply = process.env.APPLY === "1";
  console.log(`\n=== ACP V2 offering create — ${apply ? "APPLY" : "DRY-RUN"} ===\n`);

  for (const name of NEW_OFFERINGS) {
    if (!ACP_OFFERING_MANIFEST.includes(name as never)) {
      console.log(`SKIP ${name}: not in manifest`);
      continue;
    }
  }

  const agent = await getV2AgentInfo(AGENT_ID);
  const liveByName = new Set(agent.offerings.map((o) => o.name));

  for (const name of NEW_OFFERINGS) {
    if (liveByName.has(name)) {
      console.log(`SKIP ${name}: already on V2`);
      continue;
    }
    const jsonPath = path.join(OFFERINGS_ROOT, name, "offering.json");
    if (!fs.existsSync(jsonPath)) {
      console.log(`SKIP ${name}: offering.json not found at ${jsonPath}`);
      continue;
    }
    const json = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as OfferingJson;

    const body = {
      name: json.name,
      description: json.description,
      priceValue: json.jobFee,
      priceType: json.jobFeeType,
      slaMinutes: json.slaMinutes ?? 5,
      requiredFunds: json.requiredFunds,
      requirements: json.requirement ?? { type: "object" },
      deliverable: json.deliverable ?? "object",
    };

    console.log(`\nCREATE ${name}:`);
    console.log(`  price=$${body.priceValue} (${body.priceType}), sla=${body.slaMinutes}m, desc=${body.description.length}ch`);
    console.log(`  requirements: ${JSON.stringify(body.requirements).slice(0, 120)}...`);

    if (!apply) continue;

    try {
      const res = await v2AuthenticatedFetch(`/agents/${AGENT_ID}/offerings`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        console.log(`  ❌ ${res.status}: ${text}`);
      } else {
        const json = JSON.parse(text) as { data?: { id?: string } };
        console.log(`  ✅ Created (id=${json.data?.id ?? "unknown"})`);
      }
    } catch (err) {
      console.log(`  ❌ ${(err as Error).message}`);
    }
  }

  console.log(apply ? "\nDone." : "\n(dry-run; set APPLY=1 to push)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
