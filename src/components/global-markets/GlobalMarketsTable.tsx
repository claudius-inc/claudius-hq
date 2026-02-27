"use client";

import { ExternalLink } from "lucide-react";
import { MarketData } from "./types";
import { formatPercent, getPercentColor, getPercentBg, getInfoUrl } from "./utils";
import { MomentumTrendIcon, RelativeStrengthBar, RegionBadge } from "./MarketIndicators";

interface GlobalMarketsTableProps {
  markets: MarketData[];
}

export function GlobalMarketsTable({ markets }: GlobalMarketsTableProps) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Market
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Region
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                1D
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                1W
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                1M
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                3M
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trend
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                vs VT
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Score
              </th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {markets.map((market, idx) => (
              <tr key={market.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {idx + 1}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div>
                    <div className="font-semibold text-gray-900">{market.name}</div>
                    <div className="text-xs text-gray-500">{market.ticker}</div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <RegionBadge region={market.region} />
                </td>
                <td
                  className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(market.change_1d)}`}
                >
                  {formatPercent(market.change_1d)}
                </td>
                <td
                  className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(market.change_1w)}`}
                >
                  {formatPercent(market.change_1w)}
                </td>
                <td
                  className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(market.change_1m)}`}
                >
                  {formatPercent(market.change_1m)}
                </td>
                <td
                  className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(market.change_3m)}`}
                >
                  {formatPercent(market.change_3m)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-center">
                  <MomentumTrendIcon trend={market.momentum_trend} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <RelativeStrengthBar value={market.relative_strength_1m} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-md text-sm font-bold ${getPercentBg(market.composite_score)} ${getPercentColor(market.composite_score)}`}
                  >
                    {market.composite_score !== null
                      ? market.composite_score.toFixed(1)
                      : "-"}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <a
                    href={getInfoUrl(market.ticker)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-gray-400 hover:text-gray-600 inline-block"
                    title="View ETF details"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
