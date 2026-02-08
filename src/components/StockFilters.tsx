"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { StockReport } from "@/lib/types";
import { StockReportViewer } from "./StockReportViewer";
import { Select } from "./ui/Select";

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

// Parse related_tickers JSON safely
function parseRelatedTickers(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type ReportType = "all" | "sun-tzu" | "weekly-scan" | "comparison";
type DateRange = "all" | "7d" | "30d";
type SortBy = "newest" | "alphabetical";

interface StockFiltersProps {
  reports: StockReport[];
}

export function StockFilters({ reports }: StockFiltersProps) {
  const [search, setSearch] = useState("");
  const [reportType, setReportType] = useState<ReportType>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  // Separate comparison reports from single-ticker reports
  const { comparisonReports, singleReports } = useMemo(() => {
    const comparisons: StockReport[] = [];
    const singles: StockReport[] = [];
    
    for (const report of reports) {
      if (report.report_type === "comparison") {
        comparisons.push(report);
      } else {
        singles.push(report);
      }
    }
    
    return { comparisonReports: comparisons, singleReports: singles };
  }, [reports]);

  const filteredReports = useMemo(() => {
    // Start with appropriate base based on filter
    let filtered = reportType === "comparison" 
      ? [...comparisonReports]
      : reportType === "all" 
        ? [...singleReports] // "all" shows single-ticker reports; comparisons shown separately
        : [...singleReports];

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.ticker.toLowerCase().includes(q) ||
          r.title?.toLowerCase().includes(q) ||
          parseRelatedTickers(r.related_tickers).some(t => t.toLowerCase().includes(q))
      );
    }

    // Filter by report type (for non-comparison)
    if (reportType === "sun-tzu") {
      filtered = filtered.filter(
        (r) => !r.report_type || r.report_type === "sun-tzu"
      );
    } else if (reportType === "weekly-scan") {
      filtered = filtered.filter((r) => r.report_type === "weekly-scan");
    }

    // Filter by date range
    if (dateRange !== "all") {
      const now = new Date();
      const days = dateRange === "7d" ? 7 : 30;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(
        (r) => r.created_at && new Date(r.created_at) >= cutoff
      );
    }

    // Sort
    if (sortBy === "alphabetical") {
      filtered.sort((a, b) => a.ticker.localeCompare(b.ticker));
    } else {
      filtered.sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      );
    }

    return filtered;
  }, [singleReports, comparisonReports, search, reportType, dateRange, sortBy]);

  // Filter comparison reports by date/search
  const filteredComparisons = useMemo(() => {
    let filtered = [...comparisonReports];

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.ticker.toLowerCase().includes(q) ||
          r.title?.toLowerCase().includes(q) ||
          parseRelatedTickers(r.related_tickers).some(t => t.toLowerCase().includes(q))
      );
    }

    if (dateRange !== "all") {
      const now = new Date();
      const days = dateRange === "7d" ? 7 : 30;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(
        (r) => r.created_at && new Date(r.created_at) >= cutoff
      );
    }

    filtered.sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    );

    return filtered;
  }, [comparisonReports, search, dateRange]);

  // Group filtered single reports by ticker
  const reportsByTicker = useMemo(() => {
    if (reportType === "comparison") return {};
    return filteredReports.reduce((acc, report) => {
      if (!acc[report.ticker]) acc[report.ticker] = [];
      acc[report.ticker].push(report);
      return acc;
    }, {} as Record<string, StockReport[]>);
  }, [filteredReports, reportType]);

  const tickers = Object.keys(reportsByTicker);

  const sortedTickers = useMemo(() => {
    if (sortBy === "alphabetical") {
      return [...tickers].sort();
    }
    return [...tickers].sort((a, b) => {
      const aDate = new Date(reportsByTicker[a][0]?.created_at || 0);
      const bDate = new Date(reportsByTicker[b][0]?.created_at || 0);
      return bDate.getTime() - aDate.getTime();
    });
  }, [tickers, reportsByTicker, sortBy]);

  const showComparisonsSection = reportType === "all" || reportType === "comparison";
  const showSingleTickerSection = reportType !== "comparison";

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker..."
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none w-40"
        />

        {/* Report Type */}
        <Select
          value={reportType}
          onChange={(val) => setReportType(val as ReportType)}
          options={[
            { value: "all", label: "All Types" },
            { value: "sun-tzu", label: "Sun Tzu" },
            { value: "weekly-scan", label: "Weekly Scan" },
            { value: "comparison", label: "Comparison" },
          ]}
        />

        {/* Date Range */}
        <Select
          value={dateRange}
          onChange={(val) => setDateRange(val as DateRange)}
          options={[
            { value: "all", label: "All Time" },
            { value: "7d", label: "Last 7 Days" },
            { value: "30d", label: "Last 30 Days" },
          ]}
        />

        {/* Sort */}
        <Select
          value={sortBy}
          onChange={(val) => setSortBy(val as SortBy)}
          options={[
            { value: "newest", label: "Newest First" },
            { value: "alphabetical", label: "A-Z" },
          ]}
        />

        {/* Results count */}
        <span className="text-xs text-gray-500 ml-auto">
          {filteredReports.length + (showComparisonsSection ? filteredComparisons.length : 0)} report{filteredReports.length + filteredComparisons.length !== 1 ? "s" : ""}
          {reportType !== "comparison" && ` · ${sortedTickers.length} ticker${sortedTickers.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Comparisons Section */}
      {showComparisonsSection && filteredComparisons.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <span>🏆</span> Comparisons
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredComparisons.map((report) => {
              const relatedTickers = parseRelatedTickers(report.related_tickers);
              const allTickers = [report.ticker, ...relatedTickers.filter(t => t !== report.ticker)];
              
              return (
                <Link
                  key={report.id}
                  href={`/stocks/${encodeURIComponent(report.ticker)}?report=${report.id}`}
                  className="card-hover"
                >
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {allTickers.slice(0, 6).map((t) => (
                      <span
                        key={t}
                        className="text-xs font-medium text-emerald-600 bg-emerald-50 rounded px-2 py-0.5"
                      >
                        {t}
                      </span>
                    ))}
                    {allTickers.length > 6 && (
                      <span className="text-xs text-gray-400">+{allTickers.length - 6} more</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-gray-900 line-clamp-2">
                    {report.title || "Comparison Report"}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    {formatDateTime(report.created_at)}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Single-Ticker Reports by Ticker */}
      {showSingleTickerSection && sortedTickers.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Reports by Ticker
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedTickers.map((ticker) => {
              const tickerReports = reportsByTicker[ticker];
              const latestReport = tickerReports[0];
              return (
                <Link
                  key={ticker}
                  href={`/stocks/${encodeURIComponent(latestReport.ticker)}`}
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
                      {tickerReports.length} report{tickerReports.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    Latest: {formatDateTime(latestReport.created_at)}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Latest Reports */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Latest Reports
            </h2>
            <div className="space-y-4">
              {filteredReports.slice(0, 5).map((report) => (
                <StockReportViewer key={report.id} report={report} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {sortedTickers.length === 0 && filteredComparisons.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No matching reports</h3>
          <p className="text-sm text-gray-500">
            Try adjusting your filters or search term
          </p>
        </div>
      )}
    </div>
  );
}
