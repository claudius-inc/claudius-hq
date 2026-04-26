/**
 * One-time bootstrap of the V2 ACP auth row in marketCache.
 *
 * Usage:
 *   ACP_V2_REFRESH_TOKEN=<refresh> npx tsx scripts/bootstrap-v2-auth.ts
 *
 * The refresh token can be obtained from `~/.config/acp-cli/secrets.json`
 * after running `acp configure` locally.
 *
 * This script calls /auth/cli/refresh once, persists the rotated tokens to
 * the production Turso DB (per .env DATABASE_URL), and then the running app
 * takes over refreshing on its own.
 */

import "dotenv/config";
import { db } from "@/db";
import { marketCache } from "@/db/schema";
import { eq } from "drizzle-orm";

const V2_BASE_URL = "https://api.acp.virtuals.io";
const CACHE_KEY = "acp_v2_auth";

async function main() {
  const refreshToken = process.env.ACP_V2_REFRESH_TOKEN;
  if (!refreshToken) {
    console.error("ACP_V2_REFRESH_TOKEN env var required.");
    process.exit(1);
  }

  console.log("Refreshing V2 token…");
  const res = await fetch(`${V2_BASE_URL}/auth/cli/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    console.error(`refresh failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  const json = (await res.json()) as {
    data: { token: string; refreshToken: string; walletAddress: string };
  };

  const exp =
    JSON.parse(Buffer.from(json.data.token.split(".")[1], "base64url").toString()).exp *
    1000;

  const row = {
    accessToken: json.data.token,
    refreshToken: json.data.refreshToken,
    walletAddress: json.data.walletAddress,
    expiresAt: exp,
  };

  const data = JSON.stringify(row);
  const updatedAt = new Date().toISOString();

  const existing = await db
    .select()
    .from(marketCache)
    .where(eq(marketCache.key, CACHE_KEY))
    .get();

  if (existing) {
    await db
      .update(marketCache)
      .set({ data, updatedAt })
      .where(eq(marketCache.key, CACHE_KEY));
    console.log("Updated existing row.");
  } else {
    await db.insert(marketCache).values({ key: CACHE_KEY, data, updatedAt });
    console.log("Inserted new row.");
  }

  console.log(`Wallet: ${row.walletAddress}`);
  console.log(`Access token expires: ${new Date(exp).toISOString()}`);
  console.log(`New refresh token (also saved): ${row.refreshToken}`);
  console.log("");
  console.log("Done. Update ~/.config/acp-cli/secrets.json with the new refresh");
  console.log("token if you plan to keep using acp-cli locally.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
