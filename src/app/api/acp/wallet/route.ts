import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;
const ACP_DIR = "/root/.openclaw/workspace/skills/acp";

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

interface WalletBalance {
  symbol: string;
  name: string;
  balance: number;
  priceUsd: number;
  valueUsd: number;
}

function parseWalletOutput(output: string): WalletBalance[] {
  const balances: WalletBalance[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // Parse lines like: "  ETH      Ether                                   0    $2055.0039536204"
    const match = line.match(/^\s+(\w+)\s+(.+?)\s+([\d.]+)\s+\$([\d.]+)$/);
    if (match) {
      const [, symbol, name, balance, priceUsd] = match;
      const balanceNum = parseFloat(balance);
      const priceNum = parseFloat(priceUsd);
      balances.push({
        symbol: symbol.trim(),
        name: name.trim(),
        balance: balanceNum,
        priceUsd: priceNum,
        valueUsd: balanceNum * priceNum,
      });
    }
  }

  return balances;
}

/**
 * GET /api/acp/wallet
 *
 * Returns wallet balances from ACP CLI
 */
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const output = execSync(`cd ${ACP_DIR} && npx tsx bin/acp.ts wallet balance 2>&1`, {
      encoding: "utf-8",
      timeout: 30000,
    });

    const balances = parseWalletOutput(output);

    // Calculate totals
    const totalValueUsd = balances.reduce((sum, b) => sum + b.valueUsd, 0);

    // Extract key balances for quick access
    const usdc = balances.find((b) => b.symbol === "USDC");
    const eth = balances.find((b) => b.symbol === "ETH" || b.symbol === "WETH");
    const btc = balances.find((b) => b.symbol === "cbBTC");

    return NextResponse.json({
      balances,
      summary: {
        totalValueUsd,
        usdc: usdc?.balance ?? 0,
        eth: eth?.balance ?? 0,
        btc: btc?.balance ?? 0,
      },
      raw: output,
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
