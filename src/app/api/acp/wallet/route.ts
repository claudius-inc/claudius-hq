import { NextRequest, NextResponse } from "next/server";
import { getAgentInfo } from "@/lib/virtuals-client";
import { logger } from "@/lib/logger";
import { ethers } from "ethers";

// HQ_API_KEY is used internally by virtuals-client for authenticated calls

// Base mainnet RPC (public endpoint, consider using Alchemy/Infura for production)
const BASE_RPC = "https://mainnet.base.org";

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
  const balances: WalletBalance[] = [];

  // Get ETH balance
  try {
    const ethBalance = await provider.getBalance(walletAddress);
    const ethBalanceNum = parseFloat(ethers.formatEther(ethBalance));
    // TODO: Fetch real ETH price from an API
    const ethPrice = 2000; // Placeholder
    balances.push({
      symbol: "ETH",
      name: "Ether",
      balance: ethBalanceNum,
      priceUsd: ethPrice,
      valueUsd: ethBalanceNum * ethPrice,
    });
  } catch (err) {
    logger.error("wallet", `Failed to get ETH balance: ${err}`);
  }

  // Get ERC20 token balances
  for (const [symbol, tokenInfo] of Object.entries(TOKENS)) {
    try {
      const contract = new ethers.Contract(tokenInfo.address, ERC20_ABI, provider);
      const balance = await contract.balanceOf(walletAddress);
      const balanceNum = parseFloat(ethers.formatUnits(balance, tokenInfo.decimals));
      
      // TODO: Fetch real prices from an API
      let priceUsd = 1; // Default for stablecoins
      if (symbol === "WETH") priceUsd = 2000;
      if (symbol === "cbBTC") priceUsd = 60000;
      
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
    // Get wallet address from Virtuals API
    const agentInfo = await getAgentInfo();
    const walletAddress = agentInfo.walletAddress;

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
