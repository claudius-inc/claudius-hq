import { NextRequest, NextResponse } from "next/server";
import { rawClient } from "@/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function toCamelCase(row: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sourceType = url.searchParams.get("source_type");
    const tagId = url.searchParams.get("tag");
    const favorite = url.searchParams.get("favorite");
    const sourceTitle = url.searchParams.get("source_title");
    const sourceAuthor = url.searchParams.get("source_author");
    const sort = url.searchParams.get("sort") || "recent";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const perPage = parseInt(url.searchParams.get("per_page") || "50", 10);
    const offset = (page - 1) * perPage;

    const conditions = ["is_archived = 0"];
    const params: (string | number)[] = [];

    if (sourceType) {
      params.push(sourceType);
      conditions.push(`source_type = ?`);
    }
    if (favorite === "1") {
      conditions.push(`is_favorite = 1`);
    }
    if (sourceTitle) {
      params.push(sourceTitle);
      conditions.push(`me.source_title = ?`);
    }
    if (sourceAuthor) {
      params.push(sourceAuthor);
      conditions.push(`me.source_author = ?`);
    }

    // Tag filter via join
    let tagJoin = "";
    if (tagId) {
      tagJoin = ` INNER JOIN memoria_entry_tags met ON me.id = met.entry_id`;
      conditions.push(`met.tag_id = ?`);
      params.push(parseInt(tagId, 10));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Order by
    let orderBy: string;
    switch (sort) {
      case "oldest":
        orderBy = "me.created_at ASC";
        break;
      case "recently_starred":
        orderBy = "me.is_favorite DESC, me.updated_at DESC";
        break;
      case "longest":
        orderBy = "LENGTH(me.content) DESC";
        break;
      default:
        orderBy = "me.created_at DESC";
    }

    // Fetch entries
    const entriesResult = await rawClient.execute({
      sql: `SELECT me.* FROM memoria_entries me${tagJoin} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      args: [...params, perPage, offset],
    });

    // Fetch tags for each entry
    const entries = await Promise.all(
      entriesResult.rows.map(async (row) => {
        const tagsResult = await rawClient.execute({
          sql: `SELECT t.id, t.name, t.color FROM memoria_tags t INNER JOIN memoria_entry_tags met ON t.id = met.tag_id WHERE met.entry_id = ?`,
          args: [row.id as number],
        });
        return { ...toCamelCase(row as Record<string, unknown>), tags: tagsResult.rows };
      })
    );

    // Count
    const countResult = await rawClient.execute({
      sql: `SELECT COUNT(*) as cnt FROM memoria_entries me${tagJoin} ${where}`,
      args: params,
    });
    const total = (countResult.rows[0]?.cnt as number) ?? 0;

    return NextResponse.json({ entries, total });
  } catch (e) {
    logger.error("api/memoria", "Failed to list entries", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Memoria is now authored in the Obsidian vault. Add entries there; they sync to HQ nightly." },
    { status: 410 }
  );
}
