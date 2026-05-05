import type { PortfolioHolding, TradeJournalEntry } from "@/db/schema";
import { formatLocalPrice, getCurrencyForTicker } from "@/lib/yahoo-utils";

interface TickerHoldingsProps {
  ticker: string;
  holding: PortfolioHolding | null;
  currentPrice: number | null;
  journal: TradeJournalEntry[];
}

function formatPrice(ticker: string, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return formatLocalPrice(ticker, value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-SG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

const ACTION_CLS: Record<string, string> = {
  buy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  add: "bg-emerald-50 text-emerald-700 border-emerald-200",
  trim: "bg-amber-50 text-amber-700 border-amber-200",
  sell: "bg-red-50 text-red-700 border-red-200",
};

export function TickerHoldings({
  ticker,
  holding,
  currentPrice,
  journal,
}: TickerHoldingsProps) {
  const pl =
    holding?.costBasis && currentPrice
      ? ((currentPrice - holding.costBasis) / holding.costBasis) * 100
      : null;
  const marketValue =
    holding?.shares && currentPrice ? holding.shares * currentPrice : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Portfolio
      </h2>

      {holding ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400">
              Allocation
            </span>
            <p className="text-sm font-semibold tabular-nums text-gray-900">
              {holding.targetAllocation.toFixed(1)}%
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400">
              Cost basis
            </span>
            <p className="text-sm font-semibold tabular-nums text-gray-900">
              {formatPrice(ticker, holding.costBasis)}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400">
              Shares
            </span>
            <p className="text-sm font-semibold tabular-nums text-gray-900">
              {holding.shares != null ? holding.shares.toFixed(2) : "—"}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400">
              Unrealized P/L
            </span>
            <p
              className={`text-sm font-semibold tabular-nums ${
                pl === null
                  ? "text-gray-400"
                  : pl >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
              }`}
            >
              {pl === null ? "—" : `${pl >= 0 ? "+" : ""}${pl.toFixed(1)}%`}
              {marketValue !== null && (
                <span className="block text-[10px] text-gray-400 font-normal">
                  {getCurrencyForTicker(ticker).symbol}
                  {marketValue.toFixed(0)} mkt val
                </span>
              )}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400">
          {ticker} is not in your portfolio.
        </p>
      )}

      {journal.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Recent journal entries
          </h3>
          <ul className="space-y-2">
            {journal.map((entry) => {
              const actionCls =
                ACTION_CLS[entry.action] || "bg-gray-100 text-gray-600 border-gray-200";
              return (
                <li
                  key={entry.id}
                  className="flex items-start gap-3 text-sm"
                >
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-wide rounded border ${actionCls} shrink-0`}
                  >
                    {entry.action}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums shrink-0 w-20">
                    {formatDate(entry.date)}
                  </span>
                  <span className="text-gray-700 truncate flex-1" title={entry.thesis}>
                    {entry.thesis}
                  </span>
                  <span className="text-gray-400 tabular-nums shrink-0">
                    {formatPrice(ticker, entry.price)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
