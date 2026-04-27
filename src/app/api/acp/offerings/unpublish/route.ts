import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findV2OfferingByName, updateV2Offering } from "@/lib/virtuals-client";
import { logger } from "@/lib/logger";
import { PublishBodySchema, formatZodError } from "@/lib/acp-schemas";

// Set isHidden=true on the V2 marketplace offering, mirroring it as
// isActive=0 in the local DB.
//
// Hiding is always allowed regardless of manifest membership — the sweep cron
// hides via this same code path. V2 is the source of truth; DB write is
// best-effort and we log (not fail) on DB-sync errors.
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

    const live = await findV2OfferingByName(name);
    if (!live) {
      return NextResponse.json(
        { error: `Offering '${name}' not found on V2 marketplace` },
        { status: 404 }
      );
    }

    const updated = await updateV2Offering(live.id, { isHidden: true });

    let dbSyncError: string | null = null;
    try {
      await db
        .update(acpOfferings)
        .set({ isActive: 0, updatedAt: new Date().toISOString() })
        .where(eq(acpOfferings.name, name));
    } catch (err) {
      dbSyncError = err instanceof Error ? err.message : String(err);
      logger.error("api/acp/offerings/unpublish", `DB sync failed for ${name}: ${dbSyncError}`);
    }

    revalidatePath("/acp");
    logger.info("api/acp/offerings/unpublish", "Unpublished offering", {
      name,
      isHidden: updated.isHidden,
      durationMs: Date.now() - startedAt,
      dbSyncError,
    });
    return NextResponse.json({
      success: true,
      name,
      isHidden: updated.isHidden,
      dbSyncError,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("api/acp/offerings/unpublish", msg, {
      name,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
