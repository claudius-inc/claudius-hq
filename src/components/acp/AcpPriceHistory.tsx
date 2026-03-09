"use client";

import { DollarSign, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface PriceChange {
  id?: number;
  price: number;
  previousPrice?: number;
  reason?: string;
  changedAt: string;
}

interface AcpPriceHistoryProps {
  changes: PriceChange[];
  currentPrice?: number;
}

export function AcpPriceHistory({ changes, currentPrice }: AcpPriceHistoryProps) {
  const formatPrice = (value: number) => `$${value.toFixed(4)}`;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getChangeIndicator = (current: number, previous?: number) => {
    if (previous === undefined) return null;
    if (current > previous) {
      return { icon: TrendingUp, color: "text-red-500", label: "increase" };
    } else if (current < previous) {
      return { icon: TrendingDown, color: "text-green-500", label: "decrease" };
    }
    return { icon: Minus, color: "text-gray-400", label: "no change" };
  };

  const getChangePercent = (current: number, previous?: number) => {
    if (previous === undefined || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-900">Price History</h4>
        {currentPrice !== undefined && (
          <span className="text-sm font-semibold text-gray-900">
            Current: {formatPrice(currentPrice)}
          </span>
        )}
      </div>

      {changes.length === 0 ? (
        <div className="text-center py-6 text-gray-500 text-sm">
          No price changes recorded
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />

          {/* Timeline items */}
          <div className="space-y-4">
            {changes.map((change, index) => {
              const indicator = getChangeIndicator(change.price, change.previousPrice);
              const changePercent = getChangePercent(change.price, change.previousPrice);
              const Icon = indicator?.icon ?? DollarSign;

              return (
                <div key={change.id ?? index} className="relative pl-8">
                  {/* Timeline dot */}
                  <div
                    className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center ${
                      index === 0 ? "bg-blue-100" : "bg-gray-100"
                    }`}
                  >
                    <Icon
                      className={`w-3 h-3 ${
                        index === 0 ? "text-blue-600" : indicator?.color ?? "text-gray-400"
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {formatPrice(change.price)}
                      </span>
                      {change.previousPrice !== undefined && changePercent !== null && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            changePercent > 0
                              ? "bg-red-50 text-red-600"
                              : changePercent < 0
                                ? "bg-green-50 text-green-600"
                                : "bg-gray-50 text-gray-600"
                          }`}
                        >
                          {changePercent > 0 ? "+" : ""}
                          {changePercent.toFixed(1)}%
                        </span>
                      )}
                    </div>

                    {change.previousPrice !== undefined && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        from {formatPrice(change.previousPrice)}
                      </div>
                    )}

                    {change.reason && (
                      <div className="text-xs text-gray-600 mt-1 italic">
                        &ldquo;{change.reason}&rdquo;
                      </div>
                    )}

                    <div className="text-xs text-gray-400 mt-1">
                      {formatDate(change.changedAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
