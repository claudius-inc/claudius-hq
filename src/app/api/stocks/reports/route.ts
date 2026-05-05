import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, stockReports, researchJobs } from "@/db";
import { desc, eq } from "drizzle-orm";
import { isApiAuthenticated } from "@/lib/auth";

// GET /api/stocks/reports — list all reports, optionally filter by ticker or slug
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker");
    const slug = searchParams.get("slug");

    let query = db.select().from(stockReports);

    // Filter by slug first (preferred for URL routing)
    if (slug) {
      const reports = await query
        .where(eq(stockReports.slug, slug))
        .orderBy(desc(stockReports.createdAt));
      return NextResponse.json({ reports });
    }

    // Fallback to ticker filter
    if (ticker) {
      const reports = await query
        .where(eq(stockReports.ticker, ticker.toUpperCase()))
        .orderBy(desc(stockReports.createdAt));
      return NextResponse.json({ reports });
    }

    const reports = await query.orderBy(desc(stockReports.createdAt));
    return NextResponse.json({ reports });
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

// Helper to determine if a string looks like a ticker (all caps, optionally with . or -)
function looksLikeTicker(str: string): boolean {
  return /^[A-Z0-9]+([.-][A-Z0-9]+)?$/.test(str);
}

// POST /api/stocks/reports — add a new report
// For sun-tzu reports: ticker is required, slug defaults to ticker
// For thematic/comparative/portfolio reports: slug is required (kebab-case)
export async function POST(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { ticker, slug, title, content, report_type, company_name, related_tickers } = body;

    const reportType = report_type || "sun-tzu";
    const isTickerReport = reportType === "sun-tzu";

    // Validation based on report type
    if (isTickerReport) {
      if (!ticker || !content) {
        return NextResponse.json(
          { error: "ticker and content are required for sun-tzu reports" },
          { status: 400 }
        );
      }
    } else {
      // Thematic/comparative/portfolio reports require slug
      if (!slug || !content) {
        return NextResponse.json(
          { error: "slug and content are required for thematic/comparative/portfolio reports" },
          { status: 400 }
        );
      }
      // Validate slug format (kebab-case)
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
        return NextResponse.json(
          { error: "slug must be kebab-case (lowercase letters, numbers, hyphens)" },
          { status: 400 }
        );
      }
    }

    // Determine final values
    const cleanTicker = ticker ? ticker.toUpperCase() : slug.toUpperCase();
    const finalSlug = isTickerReport ? (slug || ticker.toUpperCase()) : slug;
    const finalTitle = title || (isTickerReport ? `Sun Tzu Report: ${cleanTicker}` : `Report: ${slug}`);
    
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

    const [newReport] = await db
      .insert(stockReports)
      .values({
        ticker: cleanTicker,
        slug: finalSlug,
        title: finalTitle,
        content,
        reportType,
        companyName: finalCompanyName,
        relatedTickers: relatedTickersJson,
      })
      .returning();

    // Purge ISR cache
    revalidatePath("/markets/research");
    revalidatePath(`/markets/research/${finalSlug}`);
    revalidatePath(`/markets/ticker/${finalSlug}`);

    return NextResponse.json({ report: newReport }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/stocks/reports?id=123 — update a report's fields (company_name, ticker, slug, report_type)
export async function PATCH(req: NextRequest) {
  if (!isApiAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const { company_name, ticker, slug, report_type } = body;

    if (company_name === undefined && ticker === undefined && slug === undefined && report_type === undefined) {
      return NextResponse.json(
        { error: "At least one field (company_name, ticker, slug, or report_type) is required" },
        { status: 400 }
      );
    }

    const updateData: Partial<typeof stockReports.$inferInsert> = {};

    if (company_name !== undefined) {
      updateData.companyName = company_name;
    }

    if (ticker !== undefined) {
      updateData.ticker = ticker.toUpperCase();
    }

    if (slug !== undefined) {
      // Validate slug format if not a ticker
      if (slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && !/^[A-Z0-9]+([.-][A-Z0-9]+)?$/.test(slug)) {
        return NextResponse.json(
          { error: "slug must be kebab-case (for thematic) or TICKER format (for sun-tzu)" },
          { status: 400 }
        );
      }
      updateData.slug = slug;
    }

    if (report_type !== undefined) {
      updateData.reportType = report_type;
    }

    await db.update(stockReports).set(updateData).where(eq(stockReports.id, reportId));

    // Purge cache for old and new slugs
    revalidatePath("/markets/research");
    if (slug) {
      revalidatePath(`/markets/research/${slug}`);
      revalidatePath(`/markets/ticker/${slug}`);
    }

    return NextResponse.json({ success: true, id: reportId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/stocks/reports — delete a report by id
export async function DELETE(req: NextRequest) {
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
    const [existing] = await db
      .select({ id: stockReports.id })
      .from(stockReports)
      .where(eq(stockReports.id, reportId));

    if (!existing) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Clear foreign key references in research_jobs first
    await db
      .update(researchJobs)
      .set({ reportId: null })
      .where(eq(researchJobs.reportId, reportId));

    // Now delete the report
    await db.delete(stockReports).where(eq(stockReports.id, reportId));

    revalidatePath("/markets/research");

    return NextResponse.json({ success: true, deletedId: reportId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
