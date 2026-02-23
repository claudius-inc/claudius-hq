"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { StockReport } from "@/lib/types";

// Extract company name from title patterns like "Sun Tzu Report: Company Name (TICKER)"
function extractCompanyName(title: string | null | undefined): string {
  if (!title) return "";
  
  let cleaned = title
    .replace(/^Sun Tzu['']?s?\s*(Report|Analysis|Assessment|Strategic Assessment|Battlefield Assessment)\s*(of|for|:)?\s*/i, "")
    .replace(/\s*\([^)]*:[^)]*\)\s*/g, "")
    .replace(/\s*\([A-Z0-9.]+\)\s*/g, "")
    .replace(/\s*[—–-]\s*Sun Tzu.*$/i, "")
    .trim();
  
  if (/^[A-Z0-9.]{1,10}$/.test(cleaned)) {
    return "";
  }
  
  return cleaned.substring(0, 50);
}

// Format datetime with UTC correction and time
function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const utcDateStr = dateStr.endsWith("Z") ? dateStr : dateStr + "Z";
  const date = new Date(utcDateStr);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface StockFiltersProps {
  reports: StockReport[];
}

export function StockFilters({ reports }: StockFiltersProps) {
  const [search, setSearch] = useState("");
  const [showThematic, setShowThematic] = useState(false);

  // Split into ticker reports vs thematic/comparison/weekly-scan
  const { tickerReports, thematicReports } = useMemo(() => {
    const ticker: StockReport[] = [];
    const thematic: StockReport[] = [];

    for (const report of reports) {
      if (report.report_type === "comparison" || report.report_type === "thematic" || report.report_type === "weekly-scan") {
        thematic.push(report);
      } else {
        ticker.push(report);
      }
    }

    // Sort thematic by newest first
    thematic.sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    );

    return { tickerReports: ticker, thematicReports: thematic };
  }, [reports]);

  // Group ticker reports by ticker, filter by search, sort by newest
  const { sortedTickers, reportsByTicker } = useMemo(() => {
    let filtered = tickerReports;

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.ticker.toLowerCase().includes(q) ||
          r.company_name?.toLowerCase().includes(q) ||
          extractCompanyName(r.title).toLowerCase().includes(q)
      );
    }

    const grouped: Record<string, StockReport[]> = {};
    for (const report of filtered) {
      if (!grouped[report.ticker]) grouped[report.ticker] = [];
      grouped[report.ticker].push(report);
    }

    // Sort each group by newest first
    for (const ticker in grouped) {
      grouped[ticker].sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      );
    }

    // Sort tickers by latest report date (newest first)
    const sorted = Object.keys(grouped).sort((a, b) => {
      const aDate = new Date(grouped[a][0]?.created_at || 0);
      const bDate = new Date(grouped[b][0]?.created_at || 0);
      return bDate.getTime() - aDate.getTime();
    });

    return { sortedTickers: sorted, reportsByTicker: grouped };
  }, [tickerReports, search]);

  return (
    <div className="space-y-6">
      {/* Reports by Ticker */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Reports by Ticker
          </h2>
          <span className="text-xs text-gray-400 ml-auto">
            {sortedTickers.length} ticker{sortedTickers.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value.toUpperCase())}
            placeholder="Search by ticker or company..."
            autoCapitalize="characters"
            autoComplete="off"
            className="w-full pl-9 pr-9 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Ticker Grid */}
        {sortedTickers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedTickers.map((ticker) => {
              const tickerRpts = reportsByTicker[ticker];
              const latestReport = tickerRpts[0];
              return (
                <Link
                  key={ticker}
                  href={`/markets/research/${encodeURIComponent(latestReport.ticker)}`}
                  className="card-hover"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-lg font-bold text-gray-900">{ticker}</div>
                      <div className="text-sm text-gray-500 line-clamp-1 mt-1">
                        {latestReport.company_name || extractCompanyName(latestReport.title) || ticker}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {tickerRpts.length} report{tickerRpts.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    Latest: {formatDateTime(latestReport.created_at)}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <div className="mb-3 flex justify-center text-gray-400"><Search className="w-8 h-8" /></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No matching reports</h3>
            <p className="text-sm text-gray-500">
              Try a different search term
            </p>
          </div>
        )}
      </div>

      {/* Thematic & Other Reports */}
      {thematicReports.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowThematic(!showThematic)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
          >
            {showThematic ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Show thematic &amp; other reports ({thematicReports.length})
          </button>

          {showThematic && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {thematicReports.map((report) => (
                <Link
                  key={report.id}
                  href={`/markets/research/${encodeURIComponent(report.ticker)}?report=${report.id}`}
                  className="card-hover"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 rounded px-2 py-0.5">
                      {report.report_type === "comparison" ? "Comparison" : report.report_type === "weekly-scan" ? "Weekly Scan" : "Thematic"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {report.ticker}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 line-clamp-2">
                    {report.title || "Report"}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    {formatDateTime(report.created_at)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
