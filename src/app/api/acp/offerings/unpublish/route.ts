import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { acpOfferings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findV2OfferingByName, updateV2Offering } from "@/lib/virtuals-client";
import { logger } from "@/lib/logger";

// Set isHidden=true on the V2 marketplace offering, mirroring it as
// isActive=0 in the local DB.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const live = await findV2OfferingByName(name);
    if (!live) {
      return NextResponse.json(
        { error: `Offering '${name}' not found on V2 marketplace` },
        { status: 404 }
      );
    }

    const updated = await updateV2Offering(live.id, { isHidden: true });

    await db
      .update(acpOfferings)
      .set({ isActive: 0, updatedAt: new Date().toISOString() })
      .where(eq(acpOfferings.name, name));

    revalidatePath("/acp");
    return NextResponse.json({ success: true, name, isHidden: updated.isHidden });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("api/acp/offerings/unpublish", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
