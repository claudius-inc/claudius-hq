import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/stocks/reports — list all reports, optionally filter by ticker
export async function GET(req: NextRequest) {
  await ensureDB();
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker");

    let sql = "SELECT * FROM stock_reports";
    const args: string[] = [];

    if (ticker) {
      sql += " WHERE ticker = ?";
      args.push(ticker.toUpperCase());
    }

    sql += " ORDER BY created_at DESC";

    const result = await db.execute({ sql, args });
    return NextResponse.json({ reports: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/stocks/reports — add a new report
export async function POST(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDB();
  try {
    const body = await req.json();
    const { ticker, title, content, report_type } = body;

    if (!ticker || !content) {
      return NextResponse.json(
        { error: "ticker and content are required" },
        { status: 400 }
      );
    }

    const result = await db.execute({
      sql: `INSERT INTO stock_reports (ticker, title, content, report_type) 
            VALUES (?, ?, ?, ?)`,
      args: [
        ticker.toUpperCase(),
        title || `Sun Tzu Report: ${ticker.toUpperCase()}`,
        content,
        report_type || "sun-tzu",
      ],
    });

    const newReport = await db.execute({
      sql: "SELECT * FROM stock_reports WHERE id = ?",
      args: [result.lastInsertRowid!],
    });

    return NextResponse.json({ report: newReport.rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/stocks/reports?id=123 — update a report's company_name
export async function PATCH(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDB();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { company_name } = body;

    if (company_name === undefined) {
      return NextResponse.json(
        { error: "company_name is required in body" },
        { status: 400 }
      );
    }

    await db.execute({
      sql: "UPDATE stock_reports SET company_name = ? WHERE id = ?",
      args: [company_name, parseInt(id, 10)],
    });

    return NextResponse.json({ success: true, id: parseInt(id, 10) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/stocks/reports — delete a report by id
export async function DELETE(req: NextRequest) {
  await ensureDB();
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const reportId = parseInt(id, 10);
    if (isNaN(reportId)) {
      return NextResponse.json(
        { error: "id must be a valid number" },
        { status: 400 }
      );
    }

    // Check if report exists
    const existing = await db.execute({
      sql: "SELECT id FROM stock_reports WHERE id = ?",
      args: [reportId],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Clear foreign key references in research_jobs first
    await db.execute({
      sql: "UPDATE research_jobs SET report_id = NULL WHERE report_id = ?",
      args: [reportId],
    });

    // Now delete the report
    await db.execute({
      sql: "DELETE FROM stock_reports WHERE id = ?",
      args: [reportId],
    });

    return NextResponse.json({ success: true, deletedId: reportId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
