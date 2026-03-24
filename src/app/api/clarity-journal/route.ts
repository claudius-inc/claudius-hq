import { NextRequest, NextResponse } from "next/server";
import { db, clarityJournals } from "@/db";
import { desc, eq, sql, and, isNull } from "drizzle-orm";

// GET /api/clarity-journal — List entries, optionally filtered by holdingId
// Query params:
//   ?holdingId=123 — only entries linked to this holding
//   ?unlinked=true — only entries not linked to any holding (for main journal view)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const holdingId = url.searchParams.get("holdingId");
    const unlinked = url.searchParams.get("unlinked");
    
    let query = db.select().from(clarityJournals);
    
    if (holdingId) {
      query = query.where(eq(clarityJournals.holdingId, parseInt(holdingId))) as typeof query;
    } else if (unlinked === "true") {
      // Only entries not linked to any holding (legacy behavior for main journal)
      query = query.where(isNull(clarityJournals.holdingId)) as typeof query;
    }
    
    const entries = await query.orderBy(desc(clarityJournals.updatedAt));
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/clarity-journal — Create new entry
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { asset, decision, data, holdingId } = body;

    const [newEntry] = await db
      .insert(clarityJournals)
      .values({
        asset: asset ?? "",
        decision: decision ?? null,
        data: typeof data === "string" ? data : JSON.stringify(data ?? {}),
        holdingId: holdingId ?? null,
      })
      .returning();

    return NextResponse.json({ entry: newEntry }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PUT /api/clarity-journal — Update entry by id
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, asset, decision, data } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const [updated] = await db
      .update(clarityJournals)
      .set({
        asset: asset ?? "",
        decision: decision ?? null,
        data: typeof data === "string" ? data : JSON.stringify(data ?? {}),
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(clarityJournals.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ entry: updated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/clarity-journal — Delete entry by id (query or body)
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("id");

    if (!id) {
      try {
        const body = await req.json();
        id = body.id?.toString();
      } catch {
        // No body
      }
    }

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(clarityJournals)
      .where(eq(clarityJournals.id, parseInt(id)))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
