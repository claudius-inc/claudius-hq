import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  findV2OfferingByName,
  updateV2Offering,
  createV2Offering,
} from "@/lib/acp/virtuals-client";
import { logger } from "@/lib/logger";
import {
  assertAllowedOffering,
  loadOfferingMetadata,
} from "@/config/acp-offerings-manifest";
import { PublishBodySchema, formatZodError } from "@/lib/acp/acp-schemas";

// Set isHidden=false on the V2 marketplace offering, mirroring it as
// isActive=1 in the local DB.
//
// V2 is the source of truth; the DB is a cache that GET overlays V2 onto.
// We write V2 first so that a DB-write failure can never leave the UI lying
// (V2 hidden but DB says active). DB write is best-effort; we log on failure
// and return success with a `dbSyncError` field instead of failing the user.
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let name = "";
  try {
    const raw = await req.json();
    const parsed = PublishBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid body: ${formatZodError(parsed.error)}` },
        { status: 400 }
      );
    }
    name = parsed.data.name;

    try {
      assertAllowedOffering(name, "POST /api/acp/offerings/publish");
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }

    // Two paths:
    //  1. V2 record exists  → unhide it (PUT isHidden:false)
    //  2. V2 record missing → create it from bundled manifest metadata
    //     (covers the case where the sweep cron deleted the offering)
    const live = await findV2OfferingByName(name);
    let updated;
    let action: "unhide" | "create";
    if (live) {
      updated = await updateV2Offering(live.id, { isHidden: false });
      action = "unhide";
    } else {
      const meta = await loadOfferingMetadata(name);
      if (!meta) {
        return NextResponse.json(
          {
            error: `Offering '${name}' not found on V2 and no bundled metadata at src/data/acp-offerings/${name}.json`,
          },
          { status: 404 }
        );
      }
      updated = await createV2Offering(meta);
      action = "create";
    }

    let dbSyncError: string | null = null;
    try {
      await db
        .update(acpOfferings)
        .set({ isActive: 1, updatedAt: new Date().toISOString() })
        .where(eq(acpOfferings.name, name));
    } catch (err) {
      dbSyncError = err instanceof Error ? err.message : String(err);
      logger.error("api/acp/offerings/publish", `DB sync failed for ${name}: ${dbSyncError}`);
    }

    revalidatePath("/acp");
    logger.info("api/acp/offerings/publish", `Published offering (${action})`, {
      name,
      action,
      isHidden: updated.isHidden,
      durationMs: Date.now() - startedAt,
      dbSyncError,
    });
    return NextResponse.json({
      success: true,
      name,
      action,
      isHidden: updated.isHidden,
      dbSyncError,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("api/acp/offerings/publish", msg, {
      name,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
