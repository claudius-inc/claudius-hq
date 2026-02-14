import { NextRequest, NextResponse } from "next/server";
import { db, ideas } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { isApiAuthenticated } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const potential = searchParams.get("potential");

    const conditions = [];
    if (status) conditions.push(eq(ideas.status, status));
    if (potential) conditions.push(eq(ideas.potential, potential));

    const result = await db
      .select()
      .from(ideas)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ideas.createdAt));

    return NextResponse.json({ ideas: result });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isApiAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      id,
      title,
      description,
      source,
      market_notes,
      effort_estimate,
      potential,
      status,
      promoted_to_project_id,
      tags,
    } = body;

    if (id) {
      // Update existing
      const updateData: Partial<typeof ideas.$inferInsert> = {
        updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      };

      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (source !== undefined) updateData.source = source;
      if (market_notes !== undefined) updateData.marketNotes = market_notes;
      if (effort_estimate !== undefined) updateData.effortEstimate = effort_estimate;
      if (potential !== undefined) updateData.potential = potential;
      if (status !== undefined) updateData.status = status;
      if (promoted_to_project_id !== undefined) updateData.promotedToProjectId = promoted_to_project_id;
      if (tags !== undefined) {
        updateData.tags = typeof tags === "string" ? tags : JSON.stringify(tags);
      }

      await db.update(ideas).set(updateData).where(eq(ideas.id, id));

      const [updatedIdea] = await db.select().from(ideas).where(eq(ideas.id, id));
      return NextResponse.json({ idea: updatedIdea });
    } else {
      // Create new
      const [newIdea] = await db
        .insert(ideas)
        .values({
          title: title || "",
          description: description || "",
          source: source || "",
          marketNotes: market_notes || "",
          effortEstimate: effort_estimate || "unknown",
          potential: potential || "unknown",
          status: status || "new",
          promotedToProjectId: promoted_to_project_id || null,
          tags: typeof tags === "string" ? tags : JSON.stringify(tags || []),
        })
        .returning();

      return NextResponse.json({ idea: newIdea }, { status: 201 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
