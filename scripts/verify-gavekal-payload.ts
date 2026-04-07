/**
 * Verify the trimmed Gavekal API payload shape after the Option B trim.
 *
 * Confirms:
 *   - dataQuality is absent
 *   - updatedAt is absent
 *   - Core fields still present
 *   - Approximate wire size
 *
 * Usage: npx tsx scripts/verify-gavekal-payload.ts
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const API_BASE = process.env.VERIFY_API_BASE || "http://localhost:3000";

async function main() {
  const apiKey = process.env.HQ_API_KEY;
  if (!apiKey) throw new Error("HQ_API_KEY missing in env");

  // Bust the cache so we exercise the freshly-built compute path.
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const bust = await client.execute(
    "DELETE FROM market_cache WHERE key LIKE 'gavekal:quadrant%'",
  );
  console.log(`Cleared ${bust.rowsAffected ?? 0} marketCache rows.\n`);

  console.log(`→ GET ${API_BASE}/api/markets/gavekal`);
  const res = await fetch(`${API_BASE}/api/markets/gavekal`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`API returned ${res.status}`);
  }

  const text = await res.text();
  const sizeKB = (text.length / 1024).toFixed(1);
  const json = JSON.parse(text) as Record<string, unknown>;

  console.log(`  ← status=${res.status}  size=${sizeKB} KB\n`);

  // Top-level fields actually present
  const topLevel = Object.keys(json).sort();
  console.log("Top-level fields:", topLevel.join(", "));

  const removed: string[] = [];
  if ("dataQuality" in json) removed.push("dataQuality");
  if ("updatedAt" in json) removed.push("updatedAt");
  if (removed.length > 0) {
    console.error(
      `\n✗ Fields still present that should have been removed: ${removed.join(", ")}`,
    );
    process.exit(1);
  }

  // Core fields must still be present
  const required = [
    "quadrant",
    "energyEfficiency",
    "currencyQuality",
    "keyRatios",
    "regimeHistory",
    "xle",
    "regimeReturns",
    "portfolioAllocation",
  ];
  const missing = required.filter((k) => !(k in json));
  if (missing.length > 0) {
    console.error(`\n✗ Missing required fields: ${missing.join(", ")}`);
    process.exit(1);
  }

  // History array sample sizes
  const energyHistory = (
    json.energyEfficiency as { history?: unknown[] }
  )?.history;
  const currencyHistory = (
    json.currencyQuality as { history?: unknown[] }
  )?.history;
  const regimeHistory = json.regimeHistory as unknown[];
  console.log("\nHistory array sizes (count of points):");
  console.log(`  energyEfficiency: ${energyHistory?.length ?? 0}`);
  console.log(`  currencyQuality:  ${currencyHistory?.length ?? 0}`);
  console.log(`  regimeHistory:    ${regimeHistory?.length ?? 0}`);

  console.log("\n✅ Payload verification passed.");
  console.log(
    `   Trimmed payload is ${sizeKB} KB. dataQuality and updatedAt confirmed removed.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
