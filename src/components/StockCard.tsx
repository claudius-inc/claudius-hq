import Link from "next/link";
import { WatchlistStock, StockPrice } from "@/lib/types";

function MiniSparkline({ prices }: { prices: StockPrice[] }) {
  if (prices.length < 2) return null;

  const values = [...prices].reverse().map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  const isUp = values[values.length - 1] >= values[0];

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={isUp ? "#10b981" : "#ef4444"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StockCard({
  stock,
  priceHistory,
}: {
  stock: WatchlistStock;
  priceHistory?: StockPrice[];
}) {
  const hasPrice = stock.price != null;
  const changeUp = (stock.change_pct ?? 0) >= 0;
  const changeColor = changeUp ? "text-emerald-600" : "text-red-500";
  const changeBg = changeUp ? "bg-emerald-50" : "bg-red-50";

  return (
    <Link href={`/stocks/${stock.ticker}`} className="block">
      <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-gray-300 transition-all">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">{stock.ticker}</span>
              <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                {stock.exchange}
              </span>
            </div>
            <div className="text-sm text-gray-500 mt-0.5 truncate max-w-[160px]">{stock.name}</div>
          </div>
          {stock.category === "holding" && (
            <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">
              HOLDING
            </span>
          )}
        </div>

        <div className="flex items-end justify-between">
          <div>
            {hasPrice ? (
              <>
                <div className="text-xl font-semibold text-gray-900">
                  {stock.price!.toFixed(2)}
                </div>
                <div className={`text-xs font-medium ${changeColor} flex items-center gap-1 mt-0.5`}>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded ${changeBg}`}>
                    {changeUp ? "▲" : "▼"}{" "}
                    {Math.abs(stock.change_amount ?? 0).toFixed(2)} (
                    {Math.abs(stock.change_pct ?? 0).toFixed(2)}%)
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-400">No price data</div>
            )}
          </div>
          {priceHistory && <MiniSparkline prices={priceHistory} />}
        </div>
      </div>
    </Link>
  );
}
