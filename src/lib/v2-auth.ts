/**
 * V2 ACP auth helper. Resolves a Bearer token for `api.acp.virtuals.io` writes
 * by reading a long-lived refresh token from `marketCache` and refreshing the
 * short-lived JWT on demand. Refresh tokens rotate on every refresh, so the
 * new pair is persisted back to the cache.
 *
 * Concurrency:
 *   - Per-process dedupe via `inflightRefresh` (one Vercel instance, multiple
 *     concurrent requests collapse to a single refresh round-trip).
 *   - Cross-process lock via a `marketCache` row with atomic CAS (two Vercel
 *     instances refreshing in parallel would otherwise both succeed at V2 and
 *     one would lose its rotated refresh token, breaking the chain). Loser
 *     polls for the new token instead of refreshing again.
 *
 * Bootstrap once with scripts/bootstrap-v2-auth.ts (or by setting
 * ACP_V2_REFRESH_TOKEN_BOOTSTRAP env var, which is consumed exactly once).
 */

import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketCache } from "@/db/schema";
import { logger } from "@/lib/logger";

const V2_BASE_URL = "https://api.acp.virtuals.io";
const CACHE_KEY = "acp_v2_auth";
const LOCK_KEY = "acp_v2_auth_lock";
const REFRESH_BUFFER_MS = 60_000;
const LOCK_TTL_MS = 30_000;
const WAIT_FOR_REFRESH_MS = 15_000;
const WAIT_POLL_MS = 200;

interface V2AuthRow {
  accessToken: string;
  refreshToken: string;
  walletAddress: string;
  expiresAt: number;
}

interface LockData {
  owner: string;
  expiresAt: number;
}

let memoCache: V2AuthRow | null = null;
let inflightRefresh: Promise<V2AuthRow> | null = null;

function decodeJwtExp(token: string): number {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Malformed JWT");
  const json = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (typeof json.exp !== "number") throw new Error("JWT missing exp");
  return json.exp * 1000;
}

async function readAuthRow(useCache: boolean = true): Promise<V2AuthRow | null> {
  if (useCache && memoCache) return memoCache;
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

/**
 * Try to claim the refresh lock. Atomic via SQLite ON CONFLICT DO UPDATE WHERE
 * — the WHERE clause prevents takeover if the existing lock has not yet
 * expired. After the upsert we re-read to verify ownership (the WHERE may have
 * suppressed the update).
 */
async function tryAcquireLock(owner: string): Promise<boolean> {
  const now = Date.now();
  const lockData: LockData = { owner, expiresAt: now + LOCK_TTL_MS };
  const data = JSON.stringify(lockData);
  const updatedAt = new Date().toISOString();
  try {
    await db
      .insert(marketCache)
      .values({ key: LOCK_KEY, data, updatedAt })
      .onConflictDoUpdate({
        target: marketCache.key,
        set: { data, updatedAt },
        where: sql`json_extract(${marketCache.data}, '$.expiresAt') < ${now}`,
      });
  } catch (err) {
    logger.warn("v2-auth", `Lock upsert threw: ${(err as Error).message}`);
    return false;
  }
  const row = await db
    .select()
    .from(marketCache)
    .where(eq(marketCache.key, LOCK_KEY))
    .get();
  if (!row) return false;
  try {
    return (JSON.parse(row.data) as LockData).owner === owner;
  } catch {
    return false;
  }
}

async function releaseLock(owner: string): Promise<void> {
  const row = await db
    .select()
    .from(marketCache)
    .where(eq(marketCache.key, LOCK_KEY))
    .get();
  if (!row) return;
  try {
    if ((JSON.parse(row.data) as LockData).owner === owner) {
      await db.delete(marketCache).where(eq(marketCache.key, LOCK_KEY));
    }
  } catch {
    // Lock data unparseable — leave it; it'll expire on its own.
  }
}

async function waitForFreshToken(): Promise<V2AuthRow | null> {
  const deadline = Date.now() + WAIT_FOR_REFRESH_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS));
    const row = await readAuthRow(false);
    if (row && Date.now() < row.expiresAt - REFRESH_BUFFER_MS) return row;
  }
  return null;
}

async function doRefresh(refreshToken: string): Promise<V2AuthRow> {
  const startedAt = Date.now();
  const res = await fetch(`${V2_BASE_URL}/auth/cli/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error("v2-auth", `Refresh failed (${res.status}): ${text}`, {
      status: res.status,
      durationMs: Date.now() - startedAt,
    });
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
  logger.info("v2-auth", "Refreshed V2 access token", {
    durationMs: Date.now() - startedAt,
    expiresAt: new Date(row.expiresAt).toISOString(),
  });
  return row;
}

async function refreshTokens(refreshToken: string): Promise<V2AuthRow> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    const owner = randomUUID();
    if (await tryAcquireLock(owner)) {
      try {
        return await doRefresh(refreshToken);
      } finally {
        await releaseLock(owner);
      }
    }
    // Another process holds the lock — wait for them to publish the new row.
    logger.info("v2-auth", "Refresh in progress elsewhere; polling for new token");
    const fresh = await waitForFreshToken();
    if (fresh) return fresh;
    // Lock holder timed out or crashed without releasing. Force-take the lock.
    logger.warn("v2-auth", "Wait expired; taking over refresh");
    const force = await tryAcquireLock(owner);
    if (!force) {
      // Last resort — attempt refresh anyway. Risk of double-refresh is now low
      // because the prior holder has had at least 15s to finish.
      logger.warn("v2-auth", "Could not take lock; attempting refresh without it");
    }
    try {
      return await doRefresh(refreshToken);
    } finally {
      await releaseLock(owner);
    }
  })();
  try {
    return await inflightRefresh;
  } finally {
    inflightRefresh = null;
  }
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
