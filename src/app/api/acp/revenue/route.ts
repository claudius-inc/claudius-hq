import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketCache } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getV2WalletAddress } from "@/lib/acp/virtuals-client";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// V2 ACP main contract on Base — pays the seller out of escrow on job
// completion. Source: @virtuals-protocol/acp-node-v2 ACP_CONTRACT_ADDRESSES[base.id].
// Filtering inbound USDC by `from === ACP_V2_ESCROW` is what separates real
// service revenue from topups, swaps, and any other transfers into the wallet.
const ACP_V2_ESCROW = "0x238E541BfefD82238730D00a2208E5497F1832E0";

// V1 ACP escrow — kept so historical pre-migration revenue stays attributed.
const ACP_V1_ESCROW = "0xEF4364Fe4487353dF46eb7c811D4FAc78b856c7F";

const CACHE_KEY = "acp_onchain_revenue";

interface BlockscoutTransfer {
  from: { hash: string };
  token: { address_hash: string };
  total: { value: string };
  timestamp: string;
  transaction_hash: string;
}

interface RevenueData {
  totalRevenue: number;
  jobCount: number;
  lastUpdated: string;
  transfers: Array<{
    date: string;
    amount: number;
    tx: string;
  }>;
}

async function fetchTransfersForWallet(wallet: string): Promise<BlockscoutTransfer[]> {
  const url = `https://base.blockscout.com/api/v2/addresses/${wallet}/token-transfers?type=ERC-20&filter=to`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Blockscout API error for ${wallet}: ${res.status}`);
  }
  const data = (await res.json()) as { items?: BlockscoutTransfer[] };
  return data.items || [];
}

async function fetchOnChainRevenue(): Promise<RevenueData> {
  const wallet = await getV2WalletAddress();
  const items = await fetchTransfersForWallet(wallet);

  // Real revenue = inbound USDC FROM the ACP escrow contract. Anything else
  // (topups, swaps, transfers from the owner) is not service income.
  const escrowAddresses = new Set([
    ACP_V2_ESCROW.toLowerCase(),
    ACP_V1_ESCROW.toLowerCase(),
  ]);
  const acpTransfers = items.filter(
    (t) =>
      t.token.address_hash.toLowerCase() === USDC_BASE.toLowerCase() &&
      escrowAddresses.has(t.from.hash.toLowerCase())
  );

  let totalRevenue = 0;
  const transfers: RevenueData["transfers"] = [];
  for (const t of acpTransfers) {
    const amount = Number(t.total.value) / 1e6;
    totalRevenue += amount;
    transfers.push({ date: t.timestamp.slice(0, 10), amount, tx: t.transaction_hash });
  }
  transfers.sort((a, b) => b.date.localeCompare(a.date));

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    jobCount: acpTransfers.length,
    lastUpdated: new Date().toISOString(),
    transfers,
  };
}


// GET: Fetch cached revenue data
export async function GET() {
  try {
    const cached = await db
      .select()
      .from(marketCache)
      .where(eq(marketCache.key, CACHE_KEY))
      .get();
    
    if (cached) {
      const data = JSON.parse(cached.data) as RevenueData;
      return NextResponse.json({
        ...data,
        cached: true,
        cacheAge: Math.round(
          (Date.now() - new Date(cached.updatedAt || 0).getTime()) / 1000 / 60
        ),
      });
    }
    
    // No cache, return empty
    return NextResponse.json({
      totalRevenue: 0,
      jobCount: 0,
      lastUpdated: null,
      cached: false,
      message: "No cached data. POST to sync from blockchain.",
    });
  } catch (err) {
    console.error("Error fetching revenue:", err);
    return NextResponse.json(
      { error: "Failed to fetch revenue data" },
      { status: 500 }
    );
  }
}

// POST: Sync revenue from blockchain and update cache
export async function POST() {
  try {
    const revenue = await fetchOnChainRevenue();
    
    // Upsert to cache
    await db
      .insert(marketCache)
      .values({
        key: CACHE_KEY,
        data: JSON.stringify(revenue),
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: marketCache.key,
        set: {
          data: JSON.stringify(revenue),
          updatedAt: new Date().toISOString(),
        },
      });
    
    return NextResponse.json({
      success: true,
      ...revenue,
      message: "Revenue synced from blockchain",
    });
  } catch (err) {
    console.error("Error syncing revenue:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sync revenue" },
      { status: 500 }
    );
  }
}
