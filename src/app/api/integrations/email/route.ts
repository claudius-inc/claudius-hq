import { NextRequest, NextResponse } from "next/server";
import { client } from "@/db";

// Create emails table if not exists
async function ensureTable() {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS emails (id INTEGER PRIMARY KEY AUTOINCREMENT, from_address TEXT, to_address TEXT, subject TEXT, body_text TEXT, body_html TEXT, raw_payload TEXT, created_at TEXT DEFAULT (datetime('now')))"
  );
}

// POST - receive forwarded email from Cloudflare Email Worker
export async function POST(request: NextRequest) {
  try {
    await ensureTable();

    const contentType = request.headers.get("content-type") || "";
    let emailData: Record<string, unknown> = {};

    if (contentType.includes("application/json")) {
      emailData = await request.json();
    } else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      emailData = Object.fromEntries(formData.entries()) as Record<string, unknown>;
    } else {
      const text = await request.text();
      try {
        emailData = JSON.parse(text);
      } catch {
        emailData = { raw: text };
      }
    }

    const from = String(emailData.from || emailData.sender || emailData.From || "");
    const to = String(emailData.to || emailData.recipient || emailData.To || "");
    const subject = String(emailData.subject || emailData.Subject || "");
    const bodyText = String(emailData.text || emailData.body || emailData["body-plain"] || emailData.content || "");
    const bodyHtml = String(emailData.html || emailData["body-html"] || emailData.body_html || "");

    await client.execute({
      sql: "INSERT INTO emails (from_address, to_address, subject, body_text, body_html, raw_payload) VALUES (?, ?, ?, ?, ?, ?)",
      args: [from.slice(0, 500), to.slice(0, 500), subject.slice(0, 1000), bodyText.slice(0, 50000), bodyHtml.slice(0, 50000), JSON.stringify(emailData).slice(0, 100000)],
    });

    return NextResponse.json({ ok: true, message: "Email received" });
  } catch (error) {
    console.error("Email webhook error:", error);
    return NextResponse.json({ ok: false, error: "Failed to process email" }, { status: 500 });
  }
}

// GET - read recent emails (protected by API key)
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey !== process.env.HQ_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureTable();
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 50);

    const result = await client.execute({
      sql: "SELECT id, from_address, to_address, subject, body_text, created_at FROM emails ORDER BY id DESC LIMIT ?",
      args: [limit],
    });

    return NextResponse.json({ ok: true, emails: result.rows });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to fetch emails" }, { status: 500 });
  }
}
