import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unread = searchParams.get("unread");
    const targetType = searchParams.get("target_type");
    const targetId = searchParams.get("target_id");

    let sql = "SELECT * FROM comments WHERE 1=1";
    const args: (string | number)[] = [];

    if (unread === "true") {
      sql += " AND is_read = 0";
    }
    if (targetType) {
      sql += " AND target_type = ?";
      args.push(targetType);
    }
    if (targetId) {
      sql += " AND target_id = ?";
      args.push(Number(targetId));
    }

    sql += " ORDER BY created_at DESC";

    const result = await db.execute({ sql, args });
    return NextResponse.json({ comments: result.rows });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { target_type, target_id, text, author } = body;

    const result = await db.execute({
      sql: `INSERT INTO comments (target_type, target_id, text, author)
            VALUES (?, ?, ?, ?)`,
      args: [target_type, target_id, text, author || "Mr Z"],
    });

    const newComment = await db.execute({
      sql: "SELECT * FROM comments WHERE id = ?",
      args: [result.lastInsertRowid!],
    });
    return NextResponse.json({ comment: newComment.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
