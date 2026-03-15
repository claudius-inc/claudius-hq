import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { thesisDecisionLog, thesisSignals } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getThesisEntry } from "@/lib/thesis/registry";
import { evaluateSignals, evaluatePreCommitments } from "@/lib/thesis/engine";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// POST /api/thesis/gold/decision — Log a decision with signal snapshot
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;

  try {
    const body = await request.json();
    const {
      decisionType,
      reasoning,
      priceAtDecision,
      quantity,
      emotionalState,
      tradeJournalId,
    } = body;

    if (!decisionType) {
      return NextResponse.json({ error: "decisionType required" }, { status: 400 });
    }

    const entry = getThesisEntry(asset);

    let snapshotId: number | null = null;

    if (entry) {
      // Take a snapshot of current signals
      const resolver = entry.createResolver();
      const snapshot = await evaluateSignals(entry.config.signalDefinitions, resolver);
      const preCommitment = evaluatePreCommitments(
        snapshot.signals,
        entry.config.entryConditions,
        entry.config.thesisChangeConditions,
        entry.config.reviewTriggers,
      );

      const [inserted] = await db
        .insert(thesisSignals)
        .values({
          asset,
          signalData: JSON.stringify(snapshot.signals),
          overallScore: snapshot.compositeScore,
          entryMet: preCommitment.entryMet ? 1 : 0,
          changeMet: preCommitment.thesisChangeMet ? 1 : 0,
          reviewMet: preCommitment.reviewTriggered ? 1 : 0,
        })
        .returning({ id: thesisSignals.id });

      snapshotId = inserted.id;
    }

    const [decision] = await db
      .insert(thesisDecisionLog)
      .values({
        asset,
        decisionType,
        reasoning: reasoning || null,
        signalSnapshotId: snapshotId,
        priceAtDecision: priceAtDecision || null,
        quantity: quantity || null,
        emotionalState: emotionalState || null,
        tradeJournalId: tradeJournalId || null,
      })
      .returning();

    logger.info("api/thesis/decision", `Decision logged for ${asset}: ${decisionType}`, {
      decisionId: decision.id,
      snapshotId,
    });

    return NextResponse.json({ success: true, decision });
  } catch (e) {
    logger.error("api/thesis/decision", `Decision log error for ${asset}`, { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET /api/thesis/gold/decision — List decision history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;

  try {
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
    const decisions = await db
      .select()
      .from(thesisDecisionLog)
      .where(eq(thesisDecisionLog.asset, asset))
      .orderBy(desc(thesisDecisionLog.createdAt))
      .limit(limit);

    return NextResponse.json({ asset, decisions });
  } catch (e) {
    logger.error("api/thesis/decision", `Decision list error for ${asset}`, { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
