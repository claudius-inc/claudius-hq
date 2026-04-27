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

import { logger } from "@/lib/logger";

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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface SourceCodeEntry {
  ABI: string;
  Implementation: string;
  Proxy: string;
  ContractName: string;
}

interface EtherscanResponse<T> {
  status: string;
  message: string;
  result: T;
}

async function fetchSourceCode(
  chainId: number,
  address: string,
  key: string
): Promise<SourceCodeEntry | null> {
  const url = `${ETHERSCAN_V2}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    logger.warn(
      "evm-chains",
      `Etherscan v2 getsourcecode HTTP ${res.status} for ${address} on chain ${chainId}`
    );
    return null;
  }
  const json = (await res.json()) as EtherscanResponse<SourceCodeEntry[] | string>;
  if (json.status !== "1" || !Array.isArray(json.result) || json.result.length === 0) {
    logger.warn("evm-chains", `Etherscan v2 getsourcecode not-ok for ${address} on chain ${chainId}`, {
      status: json.status,
      message: json.message,
      result: typeof json.result === "string" ? json.result : undefined,
    });
    return null;
  }
  return json.result[0];
}

/**
 * Fetch the verified ABI for a contract from Etherscan v2 (unified across
 * chains). Returns null if not verified or no API key set.
 *
 * Handles proxies: when the contract is a proxy, fetches the implementation's
 * ABI and merges it with the proxy's own ABI so calldata to either layer
 * decodes correctly. Without this, common tokens like Base USDC (a proxy)
 * fail to resolve named parameters and fall through to the 4byte directory.
 */
export async function fetchVerifiedAbi(
  chainId: number,
  address: string
): Promise<string | null> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) {
    logger.warn("evm-chains", "ETHERSCAN_API_KEY not set; verified ABI lookup disabled");
    return null;
  }
  const c = getChain(chainId);
  if (!c.etherscanV2) return null;

  try {
    const entry = await fetchSourceCode(chainId, address, key);
    if (!entry) return null;
    const proxyAbi = entry.ABI && entry.ABI !== "Contract source code not verified" ? entry.ABI : null;

    let implAbi: string | null = null;
    if (
      entry.Proxy === "1" &&
      entry.Implementation &&
      entry.Implementation.toLowerCase() !== ZERO_ADDRESS &&
      entry.Implementation.toLowerCase() !== address.toLowerCase()
    ) {
      const implEntry = await fetchSourceCode(chainId, entry.Implementation, key);
      if (
        implEntry &&
        implEntry.ABI &&
        implEntry.ABI !== "Contract source code not verified"
      ) {
        implAbi = implEntry.ABI;
      } else {
        logger.warn(
          "evm-chains",
          `Proxy ${address} on chain ${chainId} points to ${entry.Implementation} but implementation ABI not verified`
        );
      }
    }

    if (!proxyAbi && !implAbi) return null;
    if (proxyAbi && !implAbi) return proxyAbi;
    if (implAbi && !proxyAbi) return implAbi;
    return mergeAbis(proxyAbi as string, implAbi as string);
  } catch (err) {
    logger.warn(
      "evm-chains",
      `Etherscan v2 lookup failed for ${address} on chain ${chainId}: ${(err as Error).message}`
    );
    return null;
  }
}

/**
 * Merge two JSON ABI strings, deduplicating fragments by their canonical key
 * (type + name + input types). Implementation fragments win over proxy
 * fragments on collision.
 */
function mergeAbis(proxyAbi: string, implAbi: string): string {
  try {
    const proxy = JSON.parse(proxyAbi) as Array<Record<string, unknown>>;
    const impl = JSON.parse(implAbi) as Array<Record<string, unknown>>;
    const seen = new Map<string, Record<string, unknown>>();
    const keyOf = (f: Record<string, unknown>) => {
      const inputs = Array.isArray(f.inputs) ? f.inputs : [];
      const types = (inputs as Array<{ type?: string }>).map((i) => i.type ?? "").join(",");
      return `${f.type ?? ""}:${f.name ?? ""}:${types}`;
    };
    for (const f of proxy) seen.set(keyOf(f), f);
    for (const f of impl) seen.set(keyOf(f), f); // impl overrides
    return JSON.stringify(Array.from(seen.values()));
  } catch {
    // If either side won't parse, prefer impl (which has the user-facing fns)
    return implAbi;
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
