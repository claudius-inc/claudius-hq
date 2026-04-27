/**
 * EVM chain registry for ACP offerings (tx_simulate, abi_decode).
 *
 * Public RPCs are used by default to keep cost zero. If reliability becomes a
 * problem, set `ALCHEMY_API_KEY` in env and the lookup will prefer Alchemy
 * URLs where supported.
 *
 * Etherscan v2 unified-API key: set ETHERSCAN_API_KEY to enable verified-ABI
 * lookups across all supported chains via api.etherscan.io/v2.
 */

export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  rpcPublic: string;
  alchemySubdomain?: string; // {sub}.g.alchemy.com — undefined = no Alchemy
  etherscanV2: boolean; // unified Etherscan v2 supports this chain
  nativeSymbol: string;
}

export const CHAINS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum Mainnet",
    shortName: "eth",
    rpcPublic: "https://ethereum-rpc.publicnode.com",
    alchemySubdomain: "eth-mainnet",
    etherscanV2: true,
    nativeSymbol: "ETH",
  },
  8453: {
    chainId: 8453,
    name: "Base",
    shortName: "base",
    rpcPublic: "https://mainnet.base.org",
    alchemySubdomain: "base-mainnet",
    etherscanV2: true,
    nativeSymbol: "ETH",
  },
  10: {
    chainId: 10,
    name: "Optimism",
    shortName: "op",
    rpcPublic: "https://optimism-rpc.publicnode.com",
    alchemySubdomain: "opt-mainnet",
    etherscanV2: true,
    nativeSymbol: "ETH",
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    shortName: "arb",
    rpcPublic: "https://arbitrum-one-rpc.publicnode.com",
    alchemySubdomain: "arb-mainnet",
    etherscanV2: true,
    nativeSymbol: "ETH",
  },
  137: {
    chainId: 137,
    name: "Polygon",
    shortName: "poly",
    rpcPublic: "https://polygon-bor-rpc.publicnode.com",
    alchemySubdomain: "polygon-mainnet",
    etherscanV2: true,
    nativeSymbol: "MATIC",
  },
  56: {
    chainId: 56,
    name: "BNB Smart Chain",
    shortName: "bsc",
    rpcPublic: "https://bsc-rpc.publicnode.com",
    etherscanV2: true,
    nativeSymbol: "BNB",
  },
  999: {
    chainId: 999,
    name: "Hyperliquid (HyperEVM)",
    shortName: "hl",
    rpcPublic: "https://rpc.hyperliquid.xyz/evm",
    // Alchemy does not host HyperEVM as of 2026-04. Public RPC only.
    etherscanV2: true, // chain id 999 is in the Etherscan v2 unified registry
    nativeSymbol: "HYPE",
  },
};

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map(Number);

export function getChain(chainId: number): ChainConfig {
  const c = CHAINS[chainId];
  if (!c) {
    throw new Error(
      `Unsupported chainId ${chainId}. Supported: ${SUPPORTED_CHAIN_IDS.join(", ")}`
    );
  }
  return c;
}

export function getRpcUrl(chainId: number): string {
  const c = getChain(chainId);
  const key = process.env.ALCHEMY_API_KEY;
  if (key && c.alchemySubdomain) {
    return `https://${c.alchemySubdomain}.g.alchemy.com/v2/${key}`;
  }
  return c.rpcPublic;
}

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

/**
 * Fetch the verified ABI for a contract from Etherscan v2 (unified across
 * chains). Returns null if not verified or no API key set.
 */
export async function fetchVerifiedAbi(
  chainId: number,
  address: string
): Promise<string | null> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return null;
  const c = getChain(chainId);
  if (!c.etherscanV2) return null;
  const url = `${ETHERSCAN_V2}?chainid=${chainId}&module=contract&action=getabi&address=${address}&apikey=${key}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { status: string; result: string };
    if (json.status !== "1") return null;
    return json.result;
  } catch {
    return null;
  }
}

/**
 * Lookup a 4-byte selector against the public 4byte directory. Returns the
 * canonical signature with the highest "votes" / earliest creation, or null.
 */
export async function lookup4ByteSelector(
  selector: string
): Promise<string | null> {
  const sel = selector.startsWith("0x") ? selector : `0x${selector}`;
  if (sel.length !== 10) return null;
  try {
    const res = await fetch(
      `https://www.4byte.directory/api/v1/signatures/?hex_signature=${sel}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results: Array<{ text_signature: string; created_at: string }>;
    };
    if (!json.results?.length) return null;
    // Earliest is most likely the canonical one
    json.results.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return json.results[0].text_signature;
  } catch {
    return null;
  }
}

/**
 * Lookup an event topic against the 4byte event-signatures directory.
 */
export async function lookup4ByteEvent(topic: string): Promise<string | null> {
  if (!topic.startsWith("0x") || topic.length !== 66) return null;
  try {
    const res = await fetch(
      `https://www.4byte.directory/api/v1/event-signatures/?hex_signature=${topic}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results: Array<{ text_signature: string; created_at: string }>;
    };
    if (!json.results?.length) return null;
    json.results.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return json.results[0].text_signature;
  } catch {
    return null;
  }
}
