import type { Metadata } from "next";
import db, { ensureDB } from "@/lib/db";
import { StockReport } from "@/lib/types";
import Link from "next/link";
import { marked } from "marked";
import { ReportTOC } from "@/components/ReportTOC";
import { ReportActions } from "@/components/ReportActions";
import { ReadingProgressBar } from "@/components/ReadingProgressBar";
import { AlertTriangle } from "lucide-react";

// Cache stock reports for 1 hour - they don't change once generated
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { ticker: string };
}): Promise<Metadata> {
  const ticker = params.ticker.toUpperCase();
  try {
    await ensureDB();
    const result = await db.execute({
      sql: "SELECT company_name, title FROM stock_reports WHERE ticker = ? ORDER BY created_at DESC LIMIT 1",
      args: [ticker],
    });
    if (result.rows.length > 0) {
      const report = result.rows[0] as unknown as {
        company_name: string;
        title: string;
      };
      if (report.company_name) {
        return { title: `${ticker} - ${report.company_name}` };
      } else if (report.title) {
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
      .replace(/<[^>]*>/g, "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
}

// Strip redundant headers from content (page title handles these)
function stripRedundantHeaders(html: string): string {
  let cleaned = html;
  cleaned = cleaned.replace(/^(\s*<h1[^>]*>.*?<\/h1>\s*)/i, "");
  cleaned = cleaned.replace(/^(\s*<h2[^>]*>.*?Sun Tzu.*?<\/h2>\s*)/i, "");
  cleaned = cleaned.replace(/^(\s*<hr[^>]*\/?>\s*)+/i, "");
  return cleaned;
}

interface PageProps {
  params: { ticker: string };
  searchParams: { report?: string };
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: PageProps) {
  await ensureDB();
  const { ticker } = params;
  const decodedTicker = decodeURIComponent(ticker).toUpperCase();
  const selectedReportId = searchParams.report
    ? parseInt(searchParams.report, 10)
    : null;

  let report: StockReport | null = null;
  let olderReports: StockReport[] = [];

  try {
    if (selectedReportId) {
      const result = await db.execute({
        sql: "SELECT * FROM stock_reports WHERE id = ? AND UPPER(ticker) = ?",
        args: [selectedReportId, decodedTicker],
      });
      if (result.rows.length > 0) {
        report = result.rows[0] as unknown as StockReport;
      }
    }

    if (!report) {
      const result = await db.execute({
        sql: "SELECT * FROM stock_reports WHERE UPPER(ticker) = ? ORDER BY created_at DESC LIMIT 1",
        args: [decodedTicker],
      });
      if (result.rows.length > 0) {
        report = result.rows[0] as unknown as StockReport;
      }
    }

    if (report) {
      const older = await db.execute({
        sql: "SELECT id, ticker, title, created_at FROM stock_reports WHERE UPPER(ticker) = ? AND id != ? ORDER BY created_at DESC",
        args: [decodedTicker, report.id],
      });
      olderReports = older.rows as unknown as StockReport[];
    }
  } catch {
    /* ignore */
  }

  const rawHtml = report ? await marked(report.content) : "";
  const htmlContent = stripRedundantHeaders(addHeadingIds(rawHtml));

  const formatFullTimestamp = (timestamp: string | null | undefined) => {
    if (!timestamp) return "—";
    const utcTimestamp = timestamp.endsWith("Z") ? timestamp : timestamp + "Z";
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

  const formatShortDate = (timestamp: string | null | undefined) => {
    if (!timestamp) return "—";
    const utcTimestamp = timestamp.endsWith("Z") ? timestamp : timestamp + "Z";
    const date = new Date(utcTimestamp);
    return date.toLocaleDateString("en-SG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "Asia/Singapore",
    });
  };

  // Compute staleness
  const stalenessInfo = (() => {
    if (!report?.created_at) return null;
    const utcTimestamp = report.created_at.endsWith("Z")
      ? report.created_at
      : report.created_at + "Z";
    const reportDate = new Date(utcTimestamp);
    const daysSinceReport = Math.floor(
      (Date.now() - reportDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceReport > 90) return daysSinceReport;
    return null;
  })();

  return (
    <>
      {/* Sticky header - top-12 to sit below Nav (h-12) */}
      <div className="sticky top-12 z-30 bg-gray-50 border-b border-gray-200 md:border-b-0 -mx-4 px-4">
        <div className="max-w-6xl mx-auto py-2 md:py-3">
          {/* Row 1: Breadcrumb + Actions */}
          <div className="flex items-center justify-between gap-2 text-sm mb-1">
            <div className="flex items-center gap-2 text-gray-400">
              <Link
                href="/markets/research"
                className="hover:text-gray-600 transition-colors"
              >
                Research
              </Link>
              <span>›</span>
              <span className="text-gray-900 font-medium">{decodedTicker}</span>
            </div>
            {report && (
              <ReportActions
                olderReports={
                  olderReports as {
                    id: number;
                    ticker: string;
                    title: string;
                    created_at: string;
                  }[]
                }
                currentReportId={report.id}
                ticker={decodedTicker}
                content={report.content}
                companyName={report.company_name || undefined}
              />
            )}
          </div>

          {/* Row 2: Company name + date + staleness */}
          {report ? (
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-base md:text-lg font-bold text-gray-900 leading-tight truncate">
                {report.company_name || report.ticker}
              </h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                {stalenessInfo && (
                  <span
                    className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                    title="This report may be outdated"
                  >
                    <AlertTriangle className="w-3 h-3" /> {stalenessInfo}d old
                  </span>
                )}
                <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">
                  {formatFullTimestamp(report.created_at)}
                </span>
                <span className="text-xs text-gray-400 whitespace-nowrap sm:hidden">
                  {formatShortDate(report.created_at)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Report content */}
      {report ? (
        <main className="-mx-4 lg:mx-0 lg:max-w-6xl">
          <div className="flex lg:gap-4">
            <ReportTOC content={report.content} />

            <div className="flex-1 min-w-0">
              <div className="bg-white lg:border border-gray-200 lg:rounded-xl px-4 py-6 lg:p-6">
                <div
                  className="prose prose-sm md:prose-base prose-gray max-w-none prose-headings:text-gray-900 prose-headings:scroll-mt-32 md:prose-headings:scroll-mt-36 prose-h2:text-base prose-h2:md:text-lg prose-h2:font-semibold prose-h3:text-sm prose-h3:md:text-base prose-h3:font-medium prose-p:text-gray-700 prose-strong:text-gray-900 prose-a:text-emerald-600 prose-table:text-xs prose-table:md:text-sm [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
              </div>

              {/* Previous Reports section */}
              {olderReports.length > 0 && (
                <div className="px-4 lg:px-0 mt-6">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Previous Reports
                  </h2>
                  <ul className="space-y-1">
                    {olderReports.map((r) => {
                      const olderReport = r as unknown as {
                        id: number;
                        ticker: string;
                        title: string;
                        created_at: string;
                      };
                      return (
                        <li key={olderReport.id}>
                          <Link
                            href={`/markets/research/${decodedTicker}?report=${olderReport.id}`}
                            className="text-sm text-gray-600 hover:text-emerald-600 transition-colors inline-flex items-center gap-2"
                          >
                            <span className="text-gray-400">•</span>
                            Report from{" "}
                            {formatShortDate(olderReport.created_at)}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div className="sticky bottom-0">
            <ReadingProgressBar />
          </div>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto px-4 pb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <div className="text-4xl mb-3"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              No reports found
            </h3>
            <p className="text-sm text-gray-500">
              No research reports for {decodedTicker} yet
            </p>
            <Link
              href="/markets"
              className="text-sm text-emerald-600 hover:underline mt-3 inline-block"
            >
              ← Back to Stocks
            </Link>
          </div>
        </main>
      )}
    </>
  );
}
