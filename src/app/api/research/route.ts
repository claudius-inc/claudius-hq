import { NextRequest, NextResponse } from "next/server";
import { db, researchPages } from "@/db";
import { eq, and, asc } from "drizzle-orm";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/research?projectId=7 — list research pages for a project
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const pages = await db
      .select()
      .from(researchPages)
      .where(eq(researchPages.projectId, parseInt(projectId, 10)))
      .orderBy(asc(researchPages.sortOrder), asc(researchPages.id));

    return NextResponse.json({ pages });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/research — add a new research page
export async function POST(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { project_id, slug, title, content, sort_order } = body;

    if (!project_id || !slug || !title || !content) {
      return NextResponse.json(
        { error: "project_id, slug, title, and content are required" },
        { status: 400 }
      );
    }

    const projectIdNum = parseInt(project_id, 10);

    // Check if page exists (for upsert logic)
    const [existing] = await db
      .select({ id: researchPages.id })
      .from(researchPages)
      .where(and(eq(researchPages.projectId, projectIdNum), eq(researchPages.slug, slug)));

    if (existing) {
      // Update existing
      await db
        .update(researchPages)
        .set({
          title,
          content,
          sortOrder: sort_order || 0,
          updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
        })
        .where(eq(researchPages.id, existing.id));

      return NextResponse.json({ 
        success: true, 
        id: existing.id,
        message: "Research page updated"
      });
    } else {
      // Insert new
      const [newPage] = await db
        .insert(researchPages)
        .values({
          projectId: projectIdNum,
          slug,
          title,
          content,
          sortOrder: sort_order || 0,
        })
        .returning();

      return NextResponse.json({ 
        success: true, 
        id: newPage.id,
        message: "Research page saved"
      }, { status: 201 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/research?id=123 — delete a research page
export async function DELETE(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    await db.delete(researchPages).where(eq(researchPages.id, parseInt(id, 10)));

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
