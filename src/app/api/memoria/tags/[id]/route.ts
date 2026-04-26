import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { db, memoriaTags } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const [existing] = await db.select({ id: memoriaTags.id }).from(memoriaTags).where(eq(memoriaTags.id, id));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.delete(memoriaTags).where(eq(memoriaTags.id, id));
    revalidateTag('memoria');
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("api/memoria/tags", "Failed to delete tag", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
