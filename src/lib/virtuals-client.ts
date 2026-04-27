/**
 * Virtuals ACP V2 marketplace client.
 *
 * Reads from `api.acp.virtuals.io` — no auth required for agent/offering reads.
 * Writes (offering update / hide) go through `v2AuthenticatedFetch` which
 * resolves a Bearer token from cached refresh tokens. The legacy
 * `claw-api.virtuals.io` V1 client was removed on 2026-04-26.
 */

import { v2AuthenticatedFetch } from "@/lib/v2-auth";
import { assertAllowedOffering } from "@/config/acp-offerings-manifest";

const V2_BASE_URL = "https://api.acp.virtuals.io";
const V2_AGENT_ID =
  process.env.ACP_V2_AGENT_ID || "019dc9e1-8f53-79db-9f05-5889a0f8ef4a";

export function getV2AgentId(): string {
  return V2_AGENT_ID;
}

export interface V2Offering {
  id: string;
  name: string;
  description: string;
  deliverable: string;
  requirements: Record<string, unknown> | null;
  slaMinutes: number;
  priceType: "fixed" | "dynamic";
  priceValue: number;
  requiredFunds: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface V2AgentInfo {
  id: string;
  name: string;
  description: string;
  walletAddress: string;
  solWalletAddress?: string | null;
  imageUrl?: string | null;
  cluster?: string | null;
  offerings: V2Offering[];
  chains: Array<{ chainId: number; tokenAddress?: string | null; symbol?: string | null }>;
  updatedAt: string;
}

/**
 * Fetch the live V2 agent record (profile + offerings + wallet). Source of truth.
 */
export async function getV2AgentInfo(agentId: string = V2_AGENT_ID): Promise<V2AgentInfo> {
  const res = await fetch(`${V2_BASE_URL}/agents/${encodeURIComponent(agentId)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`V2 agent fetch failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { data: V2AgentInfo };
  return json.data;
}

/**
 * Cached wallet address lookup (60s TTL) to avoid hammering the API on every
 * request when only the wallet is needed.
 */
let v2WalletCache: { address: string; ts: number } | null = null;
export async function getV2WalletAddress(): Promise<string> {
  if (v2WalletCache && Date.now() - v2WalletCache.ts < 60_000) {
    return v2WalletCache.address;
  }
  const info = await getV2AgentInfo();
  v2WalletCache = { address: info.walletAddress, ts: Date.now() };
  return info.walletAddress;
}

export interface UpdateV2OfferingBody {
  name?: string;
  description?: string;
  priceType?: "fixed" | "dynamic" | "percentage";
  priceValue?: number;
  slaMinutes?: number;
  requirements?: Record<string, unknown> | string;
  deliverable?: Record<string, unknown> | string;
  requiredFunds?: boolean;
  isHidden?: boolean;
}

/**
 * Resolve a marketplace offering by name. Returns the live V2 record so callers
 * have its `id` (UUID) for writes, or null if the name doesn't exist on the
 * agent.
 */
export async function findV2OfferingByName(
  name: string,
  agentId: string = V2_AGENT_ID
): Promise<V2Offering | null> {
  const agent = await getV2AgentInfo(agentId);
  return agent.offerings.find((o) => o.name === name) ?? null;
}

/**
 * Update an offering on the V2 marketplace. Authenticated PUT.
 *
 * If the update would unhide an offering not in the manifest, this throws.
 * Hiding (`isHidden: true`) is always allowed — the sweep cron uses it to
 * enforce the manifest.
 */
export async function updateV2Offering(
  offeringId: string,
  body: UpdateV2OfferingBody,
  agentId: string = V2_AGENT_ID
): Promise<V2Offering> {
  if (body.isHidden === false || body.name) {
    const target = await fetchOfferingForGuard(offeringId, agentId, body.name);
    if (target) assertAllowedOffering(target, `updateV2Offering(${offeringId})`);
  }
  const res = await v2AuthenticatedFetch(
    `/agents/${encodeURIComponent(agentId)}/offerings/${encodeURIComponent(offeringId)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`V2 offering update failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { data: V2Offering };
  return json.data;
}

async function fetchOfferingForGuard(
  offeringId: string,
  agentId: string,
  bodyName?: string
): Promise<string | null> {
  if (bodyName) return bodyName;
  try {
    const agent = await getV2AgentInfo(agentId);
    return agent.offerings.find((o) => o.id === offeringId)?.name ?? null;
  } catch {
    return null;
  }
}
