/**
 * One-shot: DELETE every V2 offering that is hidden + not in the manifest.
 *
 * Hidden offerings remain visible in the seller dashboard at app.virtuals.io
 * even though Butler doesn't route to them. To actually clean the UI, we
 * have to DELETE them via V2 API.
 *
 * Default mode: dry-run. To actually delete:
 *   APPLY=1 npx tsx --env-file=.env.local scripts/purge-hidden-offerings.ts
 *
 * Irreversible — the offering UUID and any associated history go away.
 */

import "dotenv/config";
import { v2AuthenticatedFetch } from "../src/lib/v2-auth";
import { getV2AgentInfo, getV2AgentId } from "../src/lib/virtuals-client";
import { ACP_OFFERING_MANIFEST } from "../src/config/acp-offerings-manifest";

async function main() {
  const apply = process.env.APPLY === "1";
  console.log(`\n=== ACP purge hidden offerings — ${apply ? "APPLY" : "DRY-RUN"} ===\n`);
  const agent = await getV2AgentInfo();
  const agentId = getV2AgentId();
  const targets = agent.offerings.filter(
    (o) => o.isHidden && !ACP_OFFERING_MANIFEST.includes(o.name as never)
  );
  console.log(`Manifest size: ${ACP_OFFERING_MANIFEST.length}`);
  console.log(`Live: ${agent.offerings.filter((o) => !o.isHidden).length}`);
  console.log(`Hidden: ${agent.offerings.filter((o) => o.isHidden).length}`);
  console.log(`Targets (hidden + not in manifest): ${targets.length}\n`);
  for (const o of targets) console.log(`  ${o.name}  (${o.id})`);

  if (!apply) {
    console.log("\n(dry-run; set APPLY=1 to delete)\n");
    return;
  }

  console.log("\nDeleting…");
  const failed: { name: string; error: string }[] = [];
  for (const o of targets) {
    try {
      const res = await v2AuthenticatedFetch(
        `/agents/${agentId}/offerings/${o.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const text = await res.text();
        console.log(`  ❌ ${o.name}: ${res.status} ${text.slice(0, 200)}`);
        failed.push({ name: o.name, error: `${res.status} ${text}` });
      } else {
        console.log(`  ✅ ${o.name}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ ${o.name}: ${msg}`);
      failed.push({ name: o.name, error: msg });
    }
  }
  console.log(`\nDeleted ${targets.length - failed.length} / ${targets.length}.`);
  if (failed.length) console.log(`Failed: ${failed.map((f) => f.name).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
