import db, { ensureDB } from "@/lib/db";
import { StockReport } from "@/lib/types";
import { Nav } from "@/components/Nav";
import Link from "next/link";
import { marked } from "marked";
import { ReportTOC } from "@/components/ReportTOC";
import { PreviousReportsDropdown } from "@/components/PreviousReportsDropdown";

export const dynamic = "force-dynamic";

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
  const htmlContent = addHeadingIds(rawHtml);

  const formatFullTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/stocks" className="hover:text-gray-600 transition-colors">Stocks</Link>
          <span>›</span>
          <span className="text-gray-900 font-medium">{decodedTicker}</span>
        </div>

        {report ? (
          <>
            {/* Header */}
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 rounded px-2 py-1">
                  {report.ticker}
                </span>
                <span className="text-xs text-gray-400">
                  {formatFullTimestamp(report.created_at)}
                </span>
                <span className="text-xs text-gray-400 bg-gray-100 rounded px-2 py-1">
                  {report.report_type || "sun-tzu"}
                </span>
                <div className="flex-grow" />
                <PreviousReportsDropdown
                  reports={olderReports}
                  currentReportId={report.id}
                />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                {report.title || `Sun Tzu Report: ${report.ticker}`}
              </h1>
            </div>

            {/* Two-column layout: TOC | Report */}
            <div className="flex gap-4">
              {/* TOC Sidebar */}
              <ReportTOC content={report.content} />

              {/* Report Content */}
              <div className="flex-1 min-w-0">
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <div 
                    className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-headings:scroll-mt-20 prose-p:text-gray-700 prose-strong:text-gray-900 prose-a:text-emerald-600"
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No reports found</h3>
            <p className="text-sm text-gray-500">No research reports for {decodedTicker} yet</p>
            <Link href="/stocks" className="text-sm text-emerald-600 hover:underline mt-3 inline-block">
              ← Back to Stocks
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
