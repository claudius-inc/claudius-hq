import { NextResponse } from "next/server";
import { seedGavekalData } from "@/lib/gavekal";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60s for initial seed

export async function POST() {
  try {
    const result = await seedGavekalData();

    logger.info("api/markets/gavekal/seed", "Seed completed", {
      seeded: result.seeded,
      errorCount: result.errors.length,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error("api/markets/gavekal/seed", "Seed failed", { error });

    return NextResponse.json(
      { error: "Failed to seed Gavekal data" },
      { status: 500 },
    );
  }
}
