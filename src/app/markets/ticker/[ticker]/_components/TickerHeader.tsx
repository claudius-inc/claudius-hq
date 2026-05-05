import type { TickerMetric } from "@/db/schema";
import { EditTickerButton } from "@/app/markets/scanner/stocks/_components/EditTickerButton";
import { formatLocalPrice } from "@/lib/yahoo-utils";

interface QuoteInput {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketChange?: number;
}

interface TickerHeaderProps {
  ticker: string;
  name: string | null;
  sector: string | null;
  quote: QuoteInput | null;
  metrics: TickerMetric | null;
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function PctCell({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  const isPos = value !== null && value !== undefined && value >= 0;
  const cls =
    value === null || value === undefined
      ? "text-gray-400"
      : isPos
        ? "text-emerald-600"
        : "text-red-600";
  return (
    <div className="flex flex-col items-start">
      <span className="text-[10px] uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${cls}`}>
        {formatPct(value ?? null)}
      </span>
    </div>
  );
}

export function TickerHeader({
  ticker,
  name,
  sector,
  quote,
  metrics,
}: TickerHeaderProps) {
  const price = quote?.regularMarketPrice ?? metrics?.price ?? null;
  const change1d =
    quote?.regularMarketChangePercent ?? metrics?.priceChange1d ?? null;
  const change1w = metrics?.priceChange1w ?? null;
  const change1m = metrics?.priceChange1m ?? null;
  const change3m = metrics?.priceChange3m ?? null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
              {ticker}
            </h1>
            {name && (
              <span className="text-base text-gray-600 truncate">{name}</span>
            )}
            <EditTickerButton
              ticker={ticker}
              variant="labeled"
              redirectAfterDelete="/markets/scanner/stocks"
            />
          </div>
          {sector && (
            <p className="text-xs text-gray-400 mt-1">{sector}</p>
          )}
        </div>

        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wider text-gray-400">
              Price
            </span>
            <span className="text-2xl font-semibold tabular-nums text-gray-900">
              {price == null ? "—" : formatLocalPrice(ticker, price)}
            </span>
          </div>
          <PctCell label="1D" value={change1d} />
          <PctCell label="1W" value={change1w} />
          <PctCell label="1M" value={change1m} />
          <PctCell label="3M" value={change3m} />
        </div>
      </div>
    </div>
  );
}
