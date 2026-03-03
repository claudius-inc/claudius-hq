import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpWalletSnapshots } from "@/db/schema";
import { desc } from "drizzle-orm";

const API_KEY = process.env.HQ_API_KEY;

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

// GET: Get latest wallet snapshot
export async function GET() {
  try {
    const [latest] = await db
      .select()
      .from(acpWalletSnapshots)
      .orderBy(desc(acpWalletSnapshots.snapshotAt))
      .limit(1);

    return NextResponse.json({ wallet: latest || null });
  } catch (error) {
    console.error("Error fetching wallet snapshot:", error);
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

    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    console.error("Error saving wallet snapshot:", error);
    return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 });
  }
}
