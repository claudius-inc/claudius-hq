import { NextResponse } from "next/server";
import db from "@/lib/db";

export const dynamic = "force-dynamic";

async function ensureHealthTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS health_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      url TEXT,
      status_code INTEGER,
      response_time_ms INTEGER,
      checked_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

export async function GET() {
  try {
    await ensureHealthTable();

    // Get projects with deploy_url
    const projectsRes = await db.execute(
      "SELECT id, name, deploy_url FROM projects WHERE deploy_url IS NOT NULL AND deploy_url != ''"
    );
    const projects = projectsRes.rows as unknown as {
      id: number;
      name: string;
      deploy_url: string;
    }[];

    const results: {
      project_id: number;
      project_name: string;
      url: string;
      status_code: number;
      response_time_ms: number;
      ok: boolean;
    }[] = [];

    for (const p of projects) {
      const start = Date.now();
      let statusCode = 0;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(p.deploy_url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeout);
        statusCode = res.status;
      } catch {
        statusCode = 0; // connection failed
      }
      const elapsed = Date.now() - start;

      // Record in DB
      await db.execute({
        sql: "INSERT INTO health_checks (project_id, url, status_code, response_time_ms) VALUES (?, ?, ?, ?)",
        args: [p.id, p.deploy_url, statusCode, elapsed],
      });

      results.push({
        project_id: p.id,
        project_name: p.name,
        url: p.deploy_url,
        status_code: statusCode,
        response_time_ms: elapsed,
        ok: statusCode >= 200 && statusCode < 400,
      });
    }

    return NextResponse.json({ checks: results });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
