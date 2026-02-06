import db, { ensureDB } from "@/lib/db";
import { StockReport } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { StockReportViewer } from "@/components/StockReportViewer";
import { ResearchForm } from "@/components/ResearchForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getReports(): Promise<StockReport[]> {
  try {
    const result = await db.execute("SELECT * FROM stock_reports ORDER BY created_at DESC");
    return result.rows as unknown as StockReport[];
  } catch {
    return [];
  }
}

export default async function StocksPage() {
  await ensureDB();
  const reports = await getReports();

  // Group reports by ticker
  const reportsByTicker = reports.reduce((acc, report) => {
    if (!acc[report.ticker]) acc[report.ticker] = [];
    acc[report.ticker].push(report);
    return acc;
  }, {} as Record<string, StockReport[]>);

  const tickers = Object.keys(reportsByTicker);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Research</h1>
            <p className="text-sm text-gray-500 mt-1">
              {reports.length} Sun Tzu reports · {tickers.length} tickers analyzed
            </p>
          </div>
        </div>

        {/* Research Form */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            New Research
          </h2>
          <div className="card">
            <ResearchForm />
          </div>
        </div>

        {/* Reports by Ticker */}
        {tickers.length > 0 ? (
          <div className="space-y-8">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Reports by Ticker
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tickers.map((ticker) => {
                const tickerReports = reportsByTicker[ticker];
                const latestReport = tickerReports[0];
                return (
                  <Link
                    key={ticker}
                    href={`/stocks/${latestReport.id}`}
                    className="card-hover"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-lg font-bold text-gray-900">{ticker}</div>
                        <div className="text-sm text-gray-500 line-clamp-1 mt-1">
                          {latestReport.title || "Sun Tzu Report"}
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {tickerReports.length} report{tickerReports.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      Latest: {latestReport.created_at?.slice(0, 10)}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Latest Reports */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Latest Reports
              </h2>
              <div className="space-y-4">
                {reports.slice(0, 5).map((report) => (
                  <StockReportViewer key={report.id} report={report} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">📈</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No reports yet</h3>
            <p className="text-sm text-gray-500">
              Enter a ticker above to queue research, or add reports via the API
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
