"use client";

import { useState, useEffect } from "react";
import { SkeletonTableRow } from "@/components/Skeleton";
import { formatPercent, getPercentColor } from "./utils";

interface TagStock {
  ticker: string;
  return_1w: number | null;
  return_1m: number | null;
  return_3m: number | null;
}

interface TagStockResultsProps {
  tag: string;
}

export function TagStockResults({ tag }: TagStockResultsProps) {
  const [stocks, setStocks] = useState<TagStock[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setStocks(null);
    fetch(`/api/tags/stocks?tag=${encodeURIComponent(tag)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStocks(d?.stocks || []))
      .catch(() => setStocks([]))
      .finally(() => setLoading(false));
  }, [tag]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left font-medium uppercase">Ticker</th>
              <th className="px-4 py-2.5 text-right font-medium uppercase">1W</th>
              <th className="px-4 py-2.5 text-right font-medium uppercase">1M</th>
              <th className="px-4 py-2.5 text-right font-medium uppercase">3M</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonTableRow key={i} cols={4} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="min-w-full">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-100">
            <th className="px-4 py-2.5 text-left font-medium uppercase">Ticker</th>
            <th className="px-4 py-2.5 text-right font-medium uppercase">1W</th>
            <th className="px-4 py-2.5 text-right font-medium uppercase">1M</th>
            <th className="px-4 py-2.5 text-right font-medium uppercase">3M</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {stocks && stocks.length > 0 ? stocks.map((stock) => (
            <tr key={stock.ticker} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <a
                  href={`/markets/research/${stock.ticker}`}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                >
                  {stock.ticker}
                </a>
              </td>
              <td className={`px-4 py-2.5 text-right text-sm font-medium ${getPercentColor(stock.return_1w)}`}>
                {formatPercent(stock.return_1w)}
              </td>
              <td className={`px-4 py-2.5 text-right text-sm font-medium ${getPercentColor(stock.return_1m)}`}>
                {formatPercent(stock.return_1m)}
              </td>
              <td className={`px-4 py-2.5 text-right text-sm font-medium ${getPercentColor(stock.return_3m)}`}>
                {formatPercent(stock.return_3m)}
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">
                No stocks found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
