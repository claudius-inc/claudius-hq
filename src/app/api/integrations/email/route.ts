import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { parseEmailBody, sanitizeFromAddress } from "@/lib/mime-parser";

const API_KEY = process.env.HQ_API_KEY;

function checkApiKey(request: NextRequest): boolean {
  if (!API_KEY) return true; // no key configured = open (dev mode)
  return request.headers.get("x-api-key") === API_KEY;
}

// POST - Receive incoming email from Cloudflare Worker
export async function POST(request: NextRequest) {
  if (!checkApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureDB();
    const body = await request.json();
    const { from, to, subject, text, html, headers } = body;

    if (!from && !to) {
      return NextResponse.json({ error: "Missing from/to fields" }, { status: 400 });
    }

    // Parse MIME content to extract clean text/html
    const parsed = parseEmailBody(text || "", html || "");
    const cleanFrom = sanitizeFromAddress(from || "");

    const result = await db.execute({
      sql: `INSERT INTO emails (from_address, to_address, subject, body_text, body_html, headers)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        cleanFrom,
        to || "",
        subject || "(no subject)",
        parsed.text,
        parsed.html,
        typeof headers === "string" ? headers : JSON.stringify(headers || {}),
      ],
    });

    return NextResponse.json(
      { ok: true, id: Number(result.lastInsertRowid) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Email receive error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET - List emails with pagination, filtering, search
export async function GET(request: NextRequest) {
  try {
    await ensureDB();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;
    const filter = searchParams.get("filter"); // "read" | "unread" | null
    const search = searchParams.get("search");
    const id = searchParams.get("id");

    // Single email by ID
    if (id) {
      const result = await db.execute({
        sql: "SELECT * FROM emails WHERE id = ?",
        args: [Number(id)],
      });
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ email: result.rows[0] });
    }

    // Build query
    const conditions: string[] = [];
    const args: (string | number)[] = [];

    if (filter === "read") {
      conditions.push("is_read = 1");
    } else if (filter === "unread") {
      conditions.push("is_read = 0");
    }

    if (search) {
      conditions.push("(from_address LIKE ? OR to_address LIKE ? OR subject LIKE ? OR body_text LIKE ?)");
      const s = `%${search}%`;
      args.push(s, s, s, s);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as count FROM emails ${where}`,
      args,
    });
    const total = Number((countResult.rows[0] as unknown as { count: number }).count);

    // Fetch
    const result = await db.execute({
      sql: `SELECT * FROM emails ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    // Unread count
    const unreadResult = await db.execute("SELECT COUNT(*) as count FROM emails WHERE is_read = 0");
    const unread = Number((unreadResult.rows[0] as unknown as { count: number }).count);

    return NextResponse.json({
      emails: result.rows,
      total,
      unread,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH - Mark email(s) as read/unread
export async function PATCH(request: NextRequest) {
  try {
    await ensureDB();
    const body = await request.json();
    const { id, ids, is_read } = body;

    const readValue = is_read !== undefined ? (is_read ? 1 : 0) : 1;

    if (id) {
      await db.execute({
        sql: "UPDATE emails SET is_read = ? WHERE id = ?",
        args: [readValue, id],
      });
    } else if (ids && Array.isArray(ids)) {
      const placeholders = ids.map(() => "?").join(",");
      await db.execute({
        sql: `UPDATE emails SET is_read = ? WHERE id IN (${placeholders})`,
        args: [readValue, ...ids],
      });
    } else if (body.all) {
      await db.execute({
        sql: "UPDATE emails SET is_read = ?",
        args: [readValue],
      });
    } else {
      return NextResponse.json({ error: "Provide id, ids[], or all:true" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
