/**
 * GET /api/cron/acp-offering-sweep
 *
 * Hourly sweep: hides any V2 offering whose name is not in
 * src/config/acp-offerings-manifest.ts. Self-healing enforcement.
 *
 * Authenticated via the `x-vercel-cron` header set automatically by Vercel
 * Cron, plus a shared CRON_SECRET in the Authorization header for manual
 * triggers and out-of-platform schedulers.
 *
 * Behavior:
 *   - mode=enforce (default): hides violators on V2 + sets isActive=0 in DB
 *   - mode=dry-run: logs violators but takes no action
 *
 * Manual trigger:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://claudiusinc.com/api/cron/acp-offering-sweep
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { getV2AgentInfo, updateV2Offering } from "@/lib/virtuals-client";
import {
  isAllowedOffering,
  getManifestMode,
  ACP_OFFERING_MANIFEST,
} from "@/config/acp-offerings-manifest";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = getManifestMode();
  const startedAt = Date.now();

  let agent;
  try {
    agent = await getV2AgentInfo();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("acp-offering-sweep", `V2 fetch failed: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const violators = agent.offerings.filter(
    (o) => !o.isHidden && !isAllowedOffering(o.name)
  );

  const swept: string[] = [];
  const failed: { name: string; error: string }[] = [];

  if (mode === "enforce") {
    for (const v of violators) {
      try {
        await updateV2Offering(v.id, { isHidden: true });
        await db
          .update(acpOfferings)
          .set({ isActive: 0, updatedAt: new Date().toISOString() })
          .where(eq(acpOfferings.name, v.name));
        swept.push(v.name);
        logger.warn("acp-offering-sweep", `Hid out-of-manifest offering: ${v.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ name: v.name, error: msg });
        logger.error("acp-offering-sweep", `Failed to hide ${v.name}: ${msg}`);
      }
    }
  } else {
    for (const v of violators) {
      logger.info(
        "acp-offering-sweep",
        `[dry-run] would hide: ${v.name} (id=${v.id})`
      );
    }
  }

  return NextResponse.json({
    mode,
    manifestSize: ACP_OFFERING_MANIFEST.length,
    liveCount: agent.offerings.filter((o) => !o.isHidden).length,
    violators: violators.map((v) => v.name),
    swept,
    failed,
    durationMs: Date.now() - startedAt,
  });
}
