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

// Extract company name from title like "Tiger Brokers (TIGR): Sun Tzu..."
function extractCompanyName(title: string, ticker: string): string {
  if (!title) return "";
  
  // Pattern 1: "Company Name (TICKER)..." or "Company Name (TICKER.SI)..."
  const match1 = title.match(/^([^(]+)\s*\([^)]+\)/);
  if (match1) {
    return match1[1].trim();
  }
  
  // Pattern 2: "TICKER - Company Name..." or "TICKER: Company Name..."
  const match2 = title.match(new RegExp(`^${ticker}\\s*[-:]\\s*([^—–-]+)`, 'i'));
  if (match2) {
    return match2[1].trim();
  }
  
  // Pattern 3: "The Art of... Analysis of Company Name"
  const match3 = title.match(/Analysis of\s+([^(]+)/i);
  if (match3) {
    return match3[1].trim().replace(/\s+Ltd\.?$/, '');
  }
  
  return "";
}

// POST /api/stocks/reports — add a new report
export async function POST(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDB();
  try {
    const body = await req.json();
    const { ticker, title, content, report_type, company_name, related_tickers } = body;

    if (!ticker || !content) {
      return NextResponse.json(
        { error: "ticker and content are required" },
        { status: 400 }
      );
    }

    const cleanTicker = ticker.toUpperCase();
    const finalTitle = title || `Sun Tzu Report: ${cleanTicker}`;
    
    // Use provided company_name or extract from title
    const finalCompanyName = company_name || extractCompanyName(finalTitle, cleanTicker);
    
    // Handle related_tickers - store as JSON string
    let relatedTickersJson = "";
    if (related_tickers) {
      if (Array.isArray(related_tickers)) {
        relatedTickersJson = JSON.stringify(related_tickers.map((t: string) => t.toUpperCase()));
      } else if (typeof related_tickers === "string") {
        relatedTickersJson = related_tickers;
      }
    }

    const result = await db.execute({
      sql: `INSERT INTO stock_reports (ticker, title, content, report_type, company_name, related_tickers) 
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        cleanTicker,
        finalTitle,
        content,
        report_type || "sun-tzu",
        finalCompanyName,
        relatedTickersJson,
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

// PATCH /api/stocks/reports?id=123 — update a report's fields (company_name, ticker)
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
    const { company_name, ticker } = body;

    if (company_name === undefined && ticker === undefined) {
      return NextResponse.json(
        { error: "At least one field (company_name or ticker) is required" },
        { status: 400 }
      );
    }

    const updates: string[] = [];
    const args: (string | number)[] = [];

    if (company_name !== undefined) {
      updates.push("company_name = ?");
      args.push(company_name);
    }

    if (ticker !== undefined) {
      updates.push("ticker = ?");
      args.push(ticker.toUpperCase());
    }

    args.push(parseInt(id, 10));

    await db.execute({
      sql: `UPDATE stock_reports SET ${updates.join(", ")} WHERE id = ?`,
      args,
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
