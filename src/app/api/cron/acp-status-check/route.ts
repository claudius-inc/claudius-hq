/**
 * GET /api/cron/acp-status-check
 *
 * Watches V2 marketplace state for our agent and logs warnings if anything
 * looks wrong:
 *   - `isHidden=true` on the agent itself (whole agent invisible to Butler)
 *   - `lastActiveAt` no longer the "always online" 2999 sentinel (means V2
 *     started tracking real-time online status for us — could indicate the
 *     seller's SSE connection dropped)
 *   - live offering count > MAX_OFFERINGS (manifest cap breached, sweep cron
 *     should heal but flag immediately)
 *
 * Schedule: every 15 min (vercel.json).
 * Auth: x-vercel-cron header OR Bearer ${CRON_SECRET}.
 *
 * Note: HYBRID/V2-native agents like Claudius do NOT need an outbound
 * heartbeat from HQ. The seller process maintains an SSE connection to V2
 * which serves as the implicit liveness signal. This cron only DETECTS
 * problems — it does not produce a heartbeat itself.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getV2AgentInfo } from "@/lib/virtuals-client";
import { MAX_OFFERINGS } from "@/config/acp-offerings-manifest";

export const dynamic = "force-dynamic";

const ALWAYS_ONLINE_SENTINEL = "2999-12-31T00:00:00.000Z";

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  let agent: Awaited<ReturnType<typeof getV2AgentInfo>> & {
    isHidden?: boolean;
    lastActiveAt?: string;
  };
  try {
    agent = (await getV2AgentInfo()) as typeof agent;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("acp-status-check", `V2 fetch failed: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const liveCount = agent.offerings.filter((o) => !o.isHidden).length;
  const warnings: string[] = [];

  if (agent.isHidden === true) {
    warnings.push("AGENT_HIDDEN: entire agent is hidden from Butler");
  }
  if (agent.lastActiveAt && agent.lastActiveAt !== ALWAYS_ONLINE_SENTINEL) {
    warnings.push(
      `LAST_ACTIVE_DRIFT: lastActiveAt=${agent.lastActiveAt} (expected ${ALWAYS_ONLINE_SENTINEL}) — seller SSE may have dropped`
    );
  }
  if (liveCount > MAX_OFFERINGS) {
    warnings.push(
      `OFFERING_OVERFLOW: ${liveCount} live offerings exceed manifest cap of ${MAX_OFFERINGS}`
    );
  }

  if (warnings.length) {
    logger.warn("acp-status-check", warnings.join("; "), {
      liveCount,
      isHidden: agent.isHidden,
      lastActiveAt: agent.lastActiveAt,
    });
  } else {
    logger.info("acp-status-check", "Agent healthy", {
      liveCount,
      durationMs: Date.now() - startedAt,
    });
  }

  return NextResponse.json({
    ok: warnings.length === 0,
    warnings,
    liveCount,
    maxOfferings: MAX_OFFERINGS,
    isHidden: agent.isHidden ?? false,
    lastActiveAt: agent.lastActiveAt,
    durationMs: Date.now() - startedAt,
  });
}
