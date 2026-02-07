import db, { ensureDB } from "@/lib/db";
import { StockReport } from "@/lib/types";
import { Nav } from "@/components/Nav";
import Link from "next/link";
import { marked } from "marked";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  await ensureDB();
  const { ticker } = await params;
  const decodedTicker = decodeURIComponent(ticker).toUpperCase();

  let report: StockReport | null = null;
  let olderReports: StockReport[] = [];

  try {
    // Get the latest report for this ticker
    const result = await db.execute({
      sql: "SELECT * FROM stock_reports WHERE UPPER(ticker) = ? ORDER BY created_at DESC LIMIT 1",
      args: [decodedTicker],
    });
    if (result.rows.length > 0) {
      report = result.rows[0] as unknown as StockReport;
      
      // Fetch older reports for the same ticker
      const older = await db.execute({
        sql: "SELECT * FROM stock_reports WHERE UPPER(ticker) = ? AND id != ? ORDER BY created_at DESC",
        args: [decodedTicker, report.id],
      });
      olderReports = older.rows as unknown as StockReport[];
    }
  } catch { /* ignore */ }

  const htmlContent = report ? await marked(report.content) : "";

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-6">
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
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 rounded px-2 py-1">
                  {report.ticker}
                </span>
                <span className="text-xs text-gray-400">
                  {report.created_at?.slice(0, 10)}
                </span>
                <span className="text-xs text-gray-400 bg-gray-100 rounded px-2 py-1">
                  {report.report_type || "sun-tzu"}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                {report.title || `Sun Tzu Report: ${report.ticker}`}
              </h1>
            </div>

            {/* Report Content */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
              <div 
                className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-a:text-emerald-600"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            </div>

            {/* Older Reports */}
            {olderReports.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Previous Reports
                </h2>
                <div className="space-y-2">
                  {olderReports.map((r) => (
                    <div
                      key={r.id}
                      className="card-hover block cursor-pointer"
                      onClick={() => window.location.href = `/stocks/${r.ticker}?report=${r.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {r.title || "Sun Tzu Report"}
                        </span>
                        <span className="text-xs text-gray-400">
                          {r.created_at?.slice(0, 10)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
