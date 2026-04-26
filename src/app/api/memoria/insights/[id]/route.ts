import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, memoriaInsights } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const [existing] = await db
      .select({ id: memoriaInsights.id })
      .from(memoriaInsights)
      .where(eq(memoriaInsights.id, id));

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.delete(memoriaInsights).where(eq(memoriaInsights.id, id));
    revalidateTag('memoria');
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("api/memoria/insights", "Failed to delete insight", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
