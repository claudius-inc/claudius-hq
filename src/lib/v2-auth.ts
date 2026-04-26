/**
 * V2 ACP auth helper. Resolves a Bearer token for `api.acp.virtuals.io` writes
 * by reading a long-lived refresh token from `marketCache` and refreshing the
 * short-lived JWT on demand. Refresh tokens rotate on every refresh, so the
 * new pair is persisted back to the cache.
 *
 * Bootstrap once with scripts/bootstrap-v2-auth.ts (or by setting
 * ACP_V2_REFRESH_TOKEN_BOOTSTRAP env var, which is consumed exactly once).
 */

import { db } from "@/db";
import { marketCache } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const V2_BASE_URL = "https://api.acp.virtuals.io";
const CACHE_KEY = "acp_v2_auth";
const REFRESH_BUFFER_MS = 60_000;

interface V2AuthRow {
  accessToken: string;
  refreshToken: string;
  walletAddress: string;
  expiresAt: number;
}

let memoCache: V2AuthRow | null = null;

function decodeJwtExp(token: string): number {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Malformed JWT");
  const json = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (typeof json.exp !== "number") throw new Error("JWT missing exp");
  return json.exp * 1000;
}

async function readAuthRow(): Promise<V2AuthRow | null> {
  if (memoCache) return memoCache;
  const row = await db
    .select()
    .from(marketCache)
    .where(eq(marketCache.key, CACHE_KEY))
    .get();
  if (!row) return null;
  try {
    memoCache = JSON.parse(row.data) as V2AuthRow;
    return memoCache;
  } catch {
    return null;
  }
}

async function writeAuthRow(row: V2AuthRow): Promise<void> {
  memoCache = row;
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
  } else {
    await db.insert(marketCache).values({ key: CACHE_KEY, data, updatedAt });
  }
}

async function refreshTokens(refreshToken: string): Promise<V2AuthRow> {
  const res = await fetch(`${V2_BASE_URL}/auth/cli/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`V2 refresh failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    data: { token: string; refreshToken: string; walletAddress: string };
  };
  const row: V2AuthRow = {
    accessToken: json.data.token,
    refreshToken: json.data.refreshToken,
    walletAddress: json.data.walletAddress,
    expiresAt: decodeJwtExp(json.data.token),
  };
  await writeAuthRow(row);
  return row;
}

export async function getV2AccessToken(): Promise<string> {
  let row = await readAuthRow();

  // Bootstrap from env on first run if cache is empty.
  if (!row) {
    const bootstrap = process.env.ACP_V2_REFRESH_TOKEN_BOOTSTRAP;
    if (!bootstrap) {
      throw new Error(
        "V2 auth not initialized. Run scripts/bootstrap-v2-auth.ts or set ACP_V2_REFRESH_TOKEN_BOOTSTRAP."
      );
    }
    logger.info("v2-auth", "Bootstrapping V2 auth from env");
    row = await refreshTokens(bootstrap);
    return row.accessToken;
  }

  if (Date.now() < row.expiresAt - REFRESH_BUFFER_MS) {
    return row.accessToken;
  }

  logger.info("v2-auth", "Refreshing V2 access token");
  const refreshed = await refreshTokens(row.refreshToken);
  return refreshed.accessToken;
}

export async function v2AuthenticatedFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getV2AccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${V2_BASE_URL}${path}`, { ...init, headers });
}
