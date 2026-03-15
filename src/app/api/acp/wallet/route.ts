import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { acpWalletSnapshots } from "@/db/schema";
import { desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Get latest wallet snapshot
export async function GET(_req: NextRequest) {
  try {
    const [latest] = await db
      .select()
      .from(acpWalletSnapshots)
      .orderBy(desc(acpWalletSnapshots.snapshotAt))
      .limit(1);

    return NextResponse.json({ wallet: latest || null });
  } catch (error) {
    logger.error("api/acp/wallet", "Error fetching wallet snapshot", { error });
    return NextResponse.json({ error: "Failed to fetch wallet" }, { status: 500 });
  }
}

// POST: Save new wallet snapshot
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { usdcBalance, ethBalance, cbbtcBalance, cbbtcValueUsd, totalValueUsd } = body;

    const [snapshot] = await db
      .insert(acpWalletSnapshots)
      .values({
        usdcBalance: usdcBalance ?? null,
        ethBalance: ethBalance ?? null,
        cbbtcBalance: cbbtcBalance ?? null,
        cbbtcValueUsd: cbbtcValueUsd ?? null,
        totalValueUsd: totalValueUsd ?? null,
      })
      .returning();

    // Invalidate ISR cache for ACP page
    revalidatePath("/acp");

    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    logger.error("api/acp/wallet", "Error saving wallet snapshot", { error });
    return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 });
  }
}
