import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import rawClient from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const result = await rawClient.execute({
      sql: `SELECT t.id, t.name, t.color, t.created_at, COUNT(met.entry_id) as count
            FROM memoria_tags t
            LEFT JOIN memoria_entry_tags met ON t.id = met.tag_id
            GROUP BY t.id, t.name, t.color, t.created_at
            ORDER BY t.name ASC`,
      args: [],
    });
    return NextResponse.json({ tags: result.rows });
  } catch (e) {
    logger.error("api/memoria/tags", "Failed to list tags", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, color } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const result = await rawClient.execute({
      sql: `INSERT INTO memoria_tags (name, color) VALUES (?, ?)`,
      args: [name.toLowerCase().trim(), color || null],
    });

    const tagId = Number(result.lastInsertRowid);
    const tagResult = await rawClient.execute({
      sql: `SELECT * FROM memoria_tags WHERE id = ?`,
      args: [tagId],
    });

    revalidateTag('memoria');
    return NextResponse.json({ tag: tagResult.rows[0] }, { status: 201 });
  } catch (e) {
    logger.error("api/memoria/tags", "Failed to create tag", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
