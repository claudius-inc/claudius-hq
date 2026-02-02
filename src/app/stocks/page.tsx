import db, { ensureDB } from "@/lib/db";
import { WatchlistStock, StockPrice, StockNews, StockReport } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { StockCard } from "@/components/StockCard";
import { StockReportViewer } from "@/components/StockReportViewer";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStocks(): Promise<WatchlistStock[]> {
  try {
    const result = await db.execute(`
      SELECT w.*, sp.price, sp.change_amount, sp.change_pct, sp.recorded_at
      FROM watchlist_stocks w
      LEFT JOIN stock_prices sp ON sp.ticker = w.ticker
        AND sp.recorded_at = (SELECT MAX(sp2.recorded_at) FROM stock_prices sp2 WHERE sp2.ticker = w.ticker)
      ORDER BY w.category DESC, w.name ASC
    `);
    return result.rows as unknown as WatchlistStock[];
  } catch {
    return [];
  }
}

async function getPriceHistory(tickers: string[]): Promise<Record<string, StockPrice[]>> {
  const map: Record<string, StockPrice[]> = {};
  for (const ticker of tickers) {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM stock_prices WHERE ticker = ? ORDER BY recorded_at DESC LIMIT 20",
        args: [ticker],
      });
      map[ticker] = result.rows as unknown as StockPrice[];
    } catch {
      map[ticker] = [];
    }
  }
  return map;
}

async function getNews(): Promise<StockNews[]> {
  try {
    const result = await db.execute("SELECT * FROM stock_news ORDER BY published_at DESC LIMIT 10");
    return result.rows as unknown as StockNews[];
  } catch {
    return [];
  }
}

async function getReports(): Promise<StockReport[]> {
  try {
    const result = await db.execute("SELECT * FROM stock_reports ORDER BY created_at DESC LIMIT 5");
    return result.rows as unknown as StockReport[];
  } catch {
    return [];
  }
}

function sentimentColor(s: string) {
  if (s === "positive") return "text-emerald-600 bg-emerald-50";
  if (s === "negative") return "text-red-500 bg-red-50";
  return "text-gray-500 bg-gray-100";
}

export default async function StocksPage() {
  await ensureDB();
  const [stocks, news, reports] = await Promise.all([getStocks(), getNews(), getReports()]);
  const tickers = stocks.map((s) => s.ticker);
  const priceHistory = await getPriceHistory(tickers);

  const holdings = stocks.filter((s) => s.category === "holding");
  const watchlist = stocks.filter((s) => s.category !== "holding");

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stocks</h1>
            <p className="text-sm text-gray-500 mt-1">
              {stocks.length} stocks tracked · {holdings.length} holdings
            </p>
          </div>
        </div>

        {/* Holdings */}
        {holdings.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Holdings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {holdings.map((stock) => (
                <StockCard key={stock.ticker} stock={stock} priceHistory={priceHistory[stock.ticker]} />
              ))}
            </div>
          </section>
        )}

        {/* Watchlist */}
        {watchlist.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Watchlist</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {watchlist.map((stock) => (
                <StockCard key={stock.ticker} stock={stock} priceHistory={priceHistory[stock.ticker]} />
              ))}
            </div>
          </section>
        )}

        {stocks.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center mb-8">
            <div className="text-4xl mb-3">📈</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No stocks tracked yet</h3>
            <p className="text-sm text-gray-500">Add stocks to your watchlist via the API</p>
          </div>
        )}

        {/* News + Reports side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* News feed */}
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent News</h2>
            {news.length > 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {news.map((item) => (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-gray-900 hover:text-emerald-600 transition-colors"
                          >
                            {item.headline}
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-gray-900">{item.headline}</span>
                        )}
                        {item.summary && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.summary}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {item.ticker && (
                            <Link
                              href={`/stocks/${item.ticker}`}
                              className="text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5"
                            >
                              {item.ticker}
                            </Link>
                          )}
                          <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${sentimentColor(item.sentiment)}`}>
                            {item.sentiment}
                          </span>
                          {item.source && (
                            <span className="text-[10px] text-gray-400">{item.source}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
                No news yet
              </div>
            )}
          </section>

          {/* Reports */}
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Latest Reports</h2>
            {reports.length > 0 ? (
              <div className="space-y-4">
                {reports.map((report) => (
                  <StockReportViewer key={report.id} report={report} />
                ))}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
                No reports yet
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
