import { NextRequest, NextResponse } from "next/server";
import { db, memoriaWikiPages } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET /api/memoria/wiki/[slug] — Fetch single wiki page
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug;
    const [page] = await db
      .select()
      .from(memoriaWikiPages)
      .where(eq(memoriaWikiPages.slug, slug))
      .limit(1);

    if (!page) {
      return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
    }

    return NextResponse.json({ page });
  } catch (e) {
    logger.error("api/memoria/wiki/[slug]", "Failed to fetch wiki page", { error: e, slug: params.slug });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/memoria/wiki/[slug] — Update wiki page
export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug;
    const body = await req.json();

    const [existing] = await db
      .select()
      .from(memoriaWikiPages)
      .where(eq(memoriaWikiPages.slug, slug))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
    }

    const updateData: Partial<typeof memoriaWikiPages.$inferInsert> = {
      updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.content !== undefined) updateData.content = body.content;
    if (body.source_insight_ids !== undefined) updateData.sourceInsightIds = JSON.stringify(body.source_insight_ids);
    if (body.cluster_topic !== undefined) updateData.clusterTopic = body.cluster_topic;

    await db
      .update(memoriaWikiPages)
      .set(updateData)
      .where(eq(memoriaWikiPages.slug, slug));

    const [updated] = await db
      .select()
      .from(memoriaWikiPages)
      .where(eq(memoriaWikiPages.slug, slug))
      .limit(1);

    return NextResponse.json({ page: updated });
  } catch (e) {
    logger.error("api/memoria/wiki/[slug]", "Failed to update wiki page", { error: e, slug: params.slug });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/memoria/wiki/[slug] — Delete wiki page
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug;

    const [existing] = await db
      .select()
      .from(memoriaWikiPages)
      .where(eq(memoriaWikiPages.slug, slug))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
    }

    await db.delete(memoriaWikiPages).where(eq(memoriaWikiPages.slug, slug));

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("api/memoria/wiki/[slug]", "Failed to delete wiki page", { error: e, slug: params.slug });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
