import type { Metadata } from "next";
import db, { ensureDB } from "@/lib/db";
import { StockReport } from "@/lib/types";
import Link from "next/link";
import { marked } from "marked";
import { ReportTOC } from "@/components/ReportTOC";
import { PreviousReportsDropdown } from "@/components/PreviousReportsDropdown";

// Cache stock reports for 1 hour - they don't change once generated
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: { ticker: string } }): Promise<Metadata> {
  const ticker = params.ticker.toUpperCase();
  try {
    await ensureDB();
    const result = await db.execute({
      sql: "SELECT company_name, title FROM stock_reports WHERE ticker = ? ORDER BY created_at DESC LIMIT 1",
      args: [ticker]
    });
    if (result.rows.length > 0) {
      const report = result.rows[0] as unknown as { company_name: string; title: string };
      // Use company_name if available, otherwise try to extract from title
      if (report.company_name) {
        return { title: `${ticker} - ${report.company_name}` };
      } else if (report.title) {
        // Try to extract company name from title like "Tiger Brokers (TIGR): Sun Tzu..."
        const match = report.title.match(/^([^(]+)\s*\(/);
        if (match) {
          return { title: `${ticker} - ${match[1].trim()}` };
        }
      }
    }
  } catch {}
  return { title: ticker };
}

// Custom renderer to add IDs to headings
function addHeadingIds(html: string): string {
  return html.replace(/<h([23])>(.*?)<\/h\1>/g, (match, level, text) => {
    const id = text
      .replace(/<[^>]*>/g, "") // Remove any HTML tags
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
}

// Strip redundant headers from content (page title handles these)
function stripRedundantHeaders(html: string): string {
  let cleaned = html;
  // Strip first H1 (company name / report title)
  cleaned = cleaned.replace(/^(\s*<h1[^>]*>.*?<\/h1>\s*)/i, '');
  // Strip "Sun Tzu Analysis | Date" type H2s at the start
  cleaned = cleaned.replace(/^(\s*<h2[^>]*>.*?Sun Tzu.*?<\/h2>\s*)/i, '');
  // Strip any leading <hr> tags
  cleaned = cleaned.replace(/^(\s*<hr[^>]*\/?>\s*)+/i, '');
  return cleaned;
}

interface PageProps {
  params: { ticker: string };
  searchParams: { report?: string };
}

export default async function ReportDetailPage({ params, searchParams }: PageProps) {
  await ensureDB();
  const { ticker } = params;
  const decodedTicker = decodeURIComponent(ticker).toUpperCase();
  const selectedReportId = searchParams.report ? parseInt(searchParams.report, 10) : null;

  let report: StockReport | null = null;
  let olderReports: StockReport[] = [];

  try {
    if (selectedReportId) {
      // Get the specific report by ID
      const result = await db.execute({
        sql: "SELECT * FROM stock_reports WHERE id = ? AND UPPER(ticker) = ?",
        args: [selectedReportId, decodedTicker],
      });
      if (result.rows.length > 0) {
        report = result.rows[0] as unknown as StockReport;
      }
    }

    if (!report) {
      // Get the latest report for this ticker
      const result = await db.execute({
        sql: "SELECT * FROM stock_reports WHERE UPPER(ticker) = ? ORDER BY created_at DESC LIMIT 1",
        args: [decodedTicker],
      });
      if (result.rows.length > 0) {
        report = result.rows[0] as unknown as StockReport;
      }
    }

    if (report) {
      // Fetch older reports for the same ticker (excluding current)
      const older = await db.execute({
        sql: "SELECT id, ticker, title, created_at FROM stock_reports WHERE UPPER(ticker) = ? AND id != ? ORDER BY created_at DESC",
        args: [decodedTicker, report.id],
      });
      olderReports = older.rows as unknown as StockReport[];
    }
  } catch { /* ignore */ }

  const rawHtml = report ? await marked(report.content) : "";
  const htmlContent = stripRedundantHeaders(addHeadingIds(rawHtml));

  const formatFullTimestamp = (timestamp: string) => {
    // DB stores UTC without 'Z' suffix - append it for correct parsing
    const utcTimestamp = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z';
    const date = new Date(utcTimestamp);
    return date.toLocaleString("en-SG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Singapore",
    });
  };

  return (
    <>
      {/* Sticky header section - top-12 to sit below Nav (h-12). StocksTabs is not sticky. */}
      <div className="sticky top-12 z-30 bg-gray-50 border-b border-gray-200 -mx-4 px-4">
        <div className="max-w-6xl mx-auto px-4 py-2 md:py-3">
          {/* Breadcrumb + Actions row */}
          <div className="flex items-center justify-between gap-2 text-sm mb-1">
            <div className="flex items-center gap-2 text-gray-400">
              <Link href="/markets" className="hover:text-gray-600 transition-colors">Markets</Link>
              <span>›</span>
              <span className="text-gray-900 font-medium">{decodedTicker}</span>
            </div>
            {report && (
              <div className="flex items-center gap-2">
                {olderReports.length > 0 && (
                  <PreviousReportsDropdown 
                    reports={olderReports} 
                    currentReportId={report.id} 
                  />
                )}
                <Link
                  href={`/markets?refresh=${encodeURIComponent(decodedTicker)}`}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                  title="Generate new research report"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="hidden sm:inline">Refresh</span>
                </Link>
              </div>
            )}
          </div>

          {report ? (
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-base md:text-lg font-bold text-gray-900 leading-tight truncate">
                {report.company_name || report.ticker}
              </h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Staleness indicator - warn if report is > 90 days old */}
                {(() => {
                  const utcTimestamp = report.created_at.endsWith('Z') ? report.created_at : report.created_at + 'Z';
                  const reportDate = new Date(utcTimestamp);
                  const daysSinceReport = Math.floor((Date.now() - reportDate.getTime()) / (1000 * 60 * 60 * 24));
                  if (daysSinceReport > 90) {
                    return (
                      <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full" title="This report may be outdated">
                        ⚠️ {daysSinceReport}d old
                      </span>
                    );
                  }
                  return null;
                })()}
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {formatFullTimestamp(report.created_at)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Report content - full width on mobile */}
      {report ? (
        <main className="lg:max-w-6xl lg:mx-auto lg:px-4 py-4 md:py-6">
          <div className="flex gap-4">
            {/* TOC Sidebar */}
            <ReportTOC content={report.content} />

            {/* Report Content - full width on mobile, contained on desktop */}
            <div className="flex-1 min-w-0">
              <div className="bg-white border-y lg:border border-gray-200 lg:rounded-xl px-4 py-6 lg:p-6">
                <div 
                  className="prose prose-sm md:prose-base prose-gray max-w-none prose-headings:text-gray-900 prose-headings:scroll-mt-32 md:prose-headings:scroll-mt-36 prose-h2:text-base prose-h2:md:text-lg prose-h2:font-semibold prose-h3:text-sm prose-h3:md:text-base prose-h3:font-medium prose-p:text-gray-700 prose-strong:text-gray-900 prose-a:text-emerald-600 prose-table:text-xs prose-table:md:text-sm [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto px-4 pb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No reports found</h3>
            <p className="text-sm text-gray-500">No research reports for {decodedTicker} yet</p>
            <Link href="/markets" className="text-sm text-emerald-600 hover:underline mt-3 inline-block">
              ← Back to Stocks
            </Link>
          </div>
        </main>
      )}
    </>
  );
}
