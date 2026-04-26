import { NextResponse } from "next/server";
import { getV2WalletAddress } from "@/lib/virtuals-client";
import { logger } from "@/lib/logger";
import { ethers } from "ethers";

// Base mainnet RPC (public endpoint, consider using Alchemy/Infura for production)
const BASE_RPC = "https://mainnet.base.org";

// CoinGecko spot prices (cached briefly to avoid rate limits).
let priceCache: { ethUsd: number; btcUsd: number; ts: number } | null = null;
async function getSpotPrices(): Promise<{ ethUsd: number; btcUsd: number }> {
  if (priceCache && Date.now() - priceCache.ts < 5 * 60_000) {
    return { ethUsd: priceCache.ethUsd, btcUsd: priceCache.btcUsd };
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd",
      { cache: "no-store" }
    );
    if (res.ok) {
      const j = (await res.json()) as { ethereum?: { usd: number }; bitcoin?: { usd: number } };
      priceCache = {
        ethUsd: j.ethereum?.usd ?? 2000,
        btcUsd: j.bitcoin?.usd ?? 60000,
        ts: Date.now(),
      };
      return { ethUsd: priceCache.ethUsd, btcUsd: priceCache.btcUsd };
    }
  } catch (err) {
    logger.warn("wallet", `Spot price fetch failed, using stale or fallback: ${err}`);
  }
  return { ethUsd: priceCache?.ethUsd ?? 2000, btcUsd: priceCache?.btcUsd ?? 60000 };
}

// Common token addresses on Base
const TOKENS: Record<string, { address: string; decimals: number; name: string }> = {
  USDC: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    name: "USD Coin",
  },
  WETH: {
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    name: "Wrapped Ether",
  },
  cbBTC: {
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    decimals: 8,
    name: "Coinbase Wrapped BTC",
  },
};

// ERC20 ABI for balanceOf
const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)"];

// No auth required for read-only wallet balance
// Server uses HQ_API_KEY internally for Virtuals API calls

interface WalletBalance {
  symbol: string;
  name: string;
  balance: number;
  priceUsd: number;
  valueUsd: number;
}

async function getTokenBalances(walletAddress: string): Promise<WalletBalance[]> {
  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const { ethUsd, btcUsd } = await getSpotPrices();
  const balances: WalletBalance[] = [];

  try {
    const ethBalance = await provider.getBalance(walletAddress);
    const ethBalanceNum = parseFloat(ethers.formatEther(ethBalance));
    balances.push({
      symbol: "ETH",
      name: "Ether",
      balance: ethBalanceNum,
      priceUsd: ethUsd,
      valueUsd: ethBalanceNum * ethUsd,
    });
  } catch (err) {
    logger.error("wallet", `Failed to get ETH balance: ${err}`);
  }

  for (const [symbol, tokenInfo] of Object.entries(TOKENS)) {
    try {
      const contract = new ethers.Contract(tokenInfo.address, ERC20_ABI, provider);
      const balance = await contract.balanceOf(walletAddress);
      const balanceNum = parseFloat(ethers.formatUnits(balance, tokenInfo.decimals));

      let priceUsd = 1; // stablecoin default
      if (symbol === "WETH") priceUsd = ethUsd;
      if (symbol === "cbBTC") priceUsd = btcUsd;

      balances.push({
        symbol,
        name: tokenInfo.name,
        balance: balanceNum,
        priceUsd,
        valueUsd: balanceNum * priceUsd,
      });
    } catch (err) {
      logger.error("wallet", `Failed to get ${symbol} balance: ${err}`);
    }
  }

  return balances;
}

/**
 * GET /api/acp/wallet
 *
 * Returns wallet address and balances from Virtuals API + Base RPC.
 * No client auth required - server uses HQ_API_KEY internally.
 */
export async function GET() {
  try {
    // Get wallet address from V2 marketplace (no auth required for reads).
    const walletAddress = await getV2WalletAddress();

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address not found" },
        { status: 500 }
      );
    }

    // Get token balances from Base RPC
    const balances = await getTokenBalances(walletAddress);

    // Calculate totals
    const totalValueUsd = balances.reduce((sum, b) => sum + b.valueUsd, 0);

    // Extract key balances for quick access
    const usdc = balances.find((b) => b.symbol === "USDC");
    const eth = balances.find((b) => b.symbol === "ETH" || b.symbol === "WETH");
    const btc = balances.find((b) => b.symbol === "cbBTC");

    return NextResponse.json({
      walletAddress,
      balances,
      summary: {
        totalValueUsd,
        usdc: usdc?.balance ?? 0,
        eth: eth?.balance ?? 0,
        btc: btc?.balance ?? 0,
      },
    });
  } catch (err) {
    const error = err as Error;
    logger.error("api/acp/wallet", `Failed to get wallet balance: ${error.message}`);
    return NextResponse.json(
      { error: "Failed to fetch wallet balance", details: error.message },
      { status: 500 }
    );
  }
}
