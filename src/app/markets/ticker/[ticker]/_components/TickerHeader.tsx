import Link from "next/link";
import type { TickerMetric } from "@/db/schema";
import { EditTickerButton } from "@/app/markets/scanner/stocks/_components/EditTickerButton";
import { formatLocalPrice } from "@/lib/markets/yahoo-utils";

interface QuoteInput {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketChange?: number;
  currency?: string;
}

interface ThemeChip {
  id: number;
  name: string;
  status: string | null;
  targetPrice: number | null;
}

interface TickerHeaderProps {
  ticker: string;
  name: string | null;
  /** Yahoo's `quote.currency` if available; otherwise the column from `scanner_universe`. */
  currency: string | null;
  quote: QuoteInput | null;
  metrics: TickerMetric | null;
  themes: ThemeChip[];
  tags: string[];
}

const STATUS_COLORS: Record<string, string> = {
  watching: "bg-gray-100 text-gray-600 border-gray-200",
  accumulating: "bg-blue-50 text-blue-700 border-blue-200",
  holding: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

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
  currency,
  quote,
  metrics,
  themes,
  tags,
}: TickerHeaderProps) {
  const price = quote?.regularMarketPrice ?? metrics?.price ?? null;
  const change1d =
    quote?.regularMarketChangePercent ?? metrics?.priceChange1d ?? null;
  const change1w = metrics?.priceChange1w ?? null;
  const change1m = metrics?.priceChange1m ?? null;
  const change3m = metrics?.priceChange3m ?? null;

  const hasChips = themes.length > 0 || tags.length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 space-y-2">
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
          {hasChips && (
            <div className="flex flex-wrap gap-1.5">
              {themes.map((t) => {
                const statusCls =
                  STATUS_COLORS[t.status || "watching"] ||
                  STATUS_COLORS.watching;
                return (
                  <Link
                    key={`theme-${t.id}`}
                    href={`/markets/scanner/themes#theme-${t.id}`}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-md border transition-colors hover:bg-gray-50 ${statusCls}`}
                  >
                    <span className="font-medium">{t.name}</span>
                    {t.status && t.status !== "watching" && (
                      <span className="text-[10px] uppercase tracking-wide opacity-70">
                        {t.status}
                      </span>
                    )}
                  </Link>
                );
              })}
              {tags.map((tag) => (
                <Link
                  key={`tag-${tag}`}
                  href={`/markets/scanner/themes?tag=${encodeURIComponent(tag)}`}
                  className="inline-flex items-center px-2 py-0.5 text-xs rounded-md border bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wider text-gray-400">
              Price
            </span>
            <span className="text-2xl font-semibold tabular-nums text-gray-900">
              {price == null ? "—" : formatLocalPrice(ticker, price, currency)}
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
