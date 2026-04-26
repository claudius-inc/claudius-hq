/**
 * Virtuals ACP V2 marketplace client.
 *
 * Reads from `api.acp.virtuals.io` — no auth required for agent/offering reads.
 * Writes (offering create/update/hide, profile edits) are UI-only on V2 and not
 * exposed by this module. The legacy `claw-api.virtuals.io` V1 client was
 * removed on 2026-04-26 — V1 is a zombie marketplace nobody buys from.
 */

const V2_BASE_URL = "https://api.acp.virtuals.io";
const V2_AGENT_ID =
  process.env.ACP_V2_AGENT_ID || "019dc9e1-8f53-79db-9f05-5889a0f8ef4a";

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
