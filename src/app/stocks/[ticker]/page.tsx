import db, { ensureDB } from "@/lib/db";
import { WatchlistStock, StockPrice, StockNews, StockReport } from "@/lib/types";
import { Nav } from "@/components/Nav";
import { StockReportViewer } from "@/components/StockReportViewer";
import Link from "next/link";

export const dynamic = "force-dynamic";

function PriceChart({ prices }: { prices: StockPrice[] }) {
  if (prices.length < 2) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
        Not enough price data for chart
      </div>
    );
  }

  const sorted = [...prices].reverse();
  const values = sorted.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 600;
  const h = 200;
  const padding = 30;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (w - padding * 2);
    const y = padding + (1 - (v - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  });

  const isUp = values[values.length - 1] >= values[0];
  const color = isUp ? "#10b981" : "#ef4444";

  // Area fill
  const firstX = padding;
  const lastX = padding + ((values.length - 1) / (values.length - 1)) * (w - padding * 2);
  const areaPoints = `${firstX},${h - padding} ${points.join(" ")} ${lastX},${h - padding}`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padding + (1 - pct) * (h - padding * 2);
          const val = min + pct * range;
          return (
            <g key={pct}>
              <line x1={padding} y1={y} x2={w - padding} y2={y} stroke="#e5e7eb" strokeWidth="1" />
              <text x={padding - 5} y={y + 3} textAnchor="end" className="text-[10px] fill-gray-400">
                {val.toFixed(1)}
              </text>
            </g>
          );
        })}
        {/* Area */}
        <polygon points={areaPoints} fill={color} fillOpacity="0.08" />
        {/* Line */}
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots at start and end */}
        {[0, values.length - 1].map((i) => {
          const x = padding + (i / (values.length - 1)) * (w - padding * 2);
          const y = padding + (1 - (values[i] - min) / range) * (h - padding * 2);
          return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 px-4 mt-1">
        <span>{sorted[0]?.recorded_at?.slice(0, 10)}</span>
        <span>{sorted[sorted.length - 1]?.recorded_at?.slice(0, 10)}</span>
      </div>
    </div>
  );
}

function sentimentColor(s: string) {
  if (s === "positive") return "text-emerald-600 bg-emerald-50";
  if (s === "negative") return "text-red-500 bg-red-50";
  return "text-gray-500 bg-gray-100";
}

export default async function StockDetailPage({ params }: { params: { ticker: string } }) {
  await ensureDB();
  const { ticker } = params;

  // Fetch stock info
  let stock: WatchlistStock | null = null;
  try {
    const result = await db.execute({
      sql: `SELECT w.*, sp.price, sp.change_amount, sp.change_pct, sp.recorded_at
            FROM watchlist_stocks w
            LEFT JOIN stock_prices sp ON sp.ticker = w.ticker
              AND sp.recorded_at = (SELECT MAX(sp2.recorded_at) FROM stock_prices sp2 WHERE sp2.ticker = w.ticker)
            WHERE w.ticker = ?`,
      args: [ticker],
    });
    if (result.rows.length > 0) stock = result.rows[0] as unknown as WatchlistStock;
  } catch { /* ignore */ }

  // Price history
  let prices: StockPrice[] = [];
  try {
    const result = await db.execute({
      sql: "SELECT * FROM stock_prices WHERE ticker = ? ORDER BY recorded_at DESC LIMIT 60",
      args: [ticker],
    });
    prices = result.rows as unknown as StockPrice[];
  } catch { /* ignore */ }

  // News
  let news: StockNews[] = [];
  try {
    const result = await db.execute({
      sql: "SELECT * FROM stock_news WHERE ticker = ? ORDER BY published_at DESC LIMIT 20",
      args: [ticker],
    });
    news = result.rows as unknown as StockNews[];
  } catch { /* ignore */ }

  // Reports
  let reports: StockReport[] = [];
  try {
    const result = await db.execute({
      sql: "SELECT * FROM stock_reports WHERE ticker = ? ORDER BY created_at DESC",
      args: [ticker],
    });
    reports = result.rows as unknown as StockReport[];
  } catch { /* ignore */ }

  const hasPrice = stock?.price != null;
  const changeUp = (stock?.change_pct ?? 0) >= 0;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/stocks" className="hover:text-gray-600 transition-colors">Stocks</Link>
          <span>›</span>
          <span className="text-gray-900 font-medium">{ticker}</span>
        </div>

        {stock ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">{stock.name}</h1>
                  <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded px-2 py-1">
                    {stock.exchange}
                  </span>
                  {stock.category === "holding" && (
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 rounded px-2 py-1">
                      HOLDING
                    </span>
                  )}
                </div>
                <div className="text-lg font-mono text-gray-500 mt-1">{ticker}</div>
              </div>
              {hasPrice && (
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900">{stock.price!.toFixed(2)}</div>
                  <div className={`text-sm font-medium mt-1 ${changeUp ? "text-emerald-600" : "text-red-500"}`}>
                    {changeUp ? "▲" : "▼"} {Math.abs(stock.change_amount ?? 0).toFixed(2)}{" "}
                    ({Math.abs(stock.change_pct ?? 0).toFixed(2)}%)
                  </div>
                  {stock.recorded_at && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Last: {stock.recorded_at.slice(0, 16).replace("T", " ")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Price chart */}
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Price History</h2>
              <PriceChart prices={prices} />
            </section>

            {/* News + Reports */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* News */}
              <section>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  News ({news.length})
                </h2>
                {news.length > 0 ? (
                  <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                    {news.map((item) => (
                      <div key={item.id} className="px-4 py-3">
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
                          <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${sentimentColor(item.sentiment)}`}>
                            {item.sentiment}
                          </span>
                          {item.source && <span className="text-[10px] text-gray-400">{item.source}</span>}
                          <span className="text-[10px] text-gray-400">
                            {item.published_at?.slice(0, 10)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
                    No news for {ticker}
                  </div>
                )}
              </section>

              {/* Reports */}
              <section>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Reports ({reports.length})
                </h2>
                {reports.length > 0 ? (
                  <div className="space-y-4">
                    {reports.map((report) => (
                      <StockReportViewer key={report.id} report={report} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
                    No reports for {ticker}
                  </div>
                )}
              </section>
            </div>
          </>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Stock not found</h3>
            <p className="text-sm text-gray-500">{ticker} is not in your watchlist</p>
            <Link href="/stocks" className="text-sm text-emerald-600 hover:underline mt-3 inline-block">
              ← Back to Stocks
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
