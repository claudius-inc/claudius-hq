"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";

interface SearchResult {
  id: number;
  ticker: string;
  title: string;
  company_name: string;
  report_type: string;
  created_at: string;
  relevance_score: number;
  snippet: string;
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const utcDateStr = dateStr.endsWith("Z") ? dateStr : dateStr + "Z";
  const date = new Date(utcDateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getReportTypeLabel(reportType: string): string {
  switch (reportType) {
    case "sun-tzu":
      return "Sun Tzu";
    case "weekly-scan":
      return "Weekly Scan";
    case "comparison":
      return "Comparison";
    default:
      return reportType;
  }
}

function getReportTypeColor(reportType: string): string {
  switch (reportType) {
    case "sun-tzu":
      return "bg-amber-100 text-amber-700";
    case "weekly-scan":
      return "bg-blue-100 text-blue-700";
    case "comparison":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export function StockSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stocks/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Search failed");
      }

      setResults(data.results || []);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim().length >= 2) {
      debounceRef.current = setTimeout(() => {
        search(query);
      }, 300);
    } else {
      setResults([]);
      setHasSearched(false);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, search]);

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg
            className="h-5 w-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reports by ticker, company name, or keywords..."
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
          autoComplete="off"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {isLoading && (
          <div className="absolute inset-y-0 right-8 flex items-center">
            <div className="h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Results */}
      {hasSearched && (
        <div className="space-y-3">
          {/* Results header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">
              {results.length === 0 ? (
                "No matching reports found"
              ) : (
                <>
                  Found {results.length} report{results.length !== 1 ? "s" : ""}
                </>
              )}
            </h3>
            {results.length > 0 && (
              <button
                onClick={handleClear}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear search
              </button>
            )}
          </div>

          {/* Results list */}
          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((result) => (
                <Link
                  key={result.id}
                  href={`/stocks/${encodeURIComponent(result.ticker)}?report=${result.id}`}
                  className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-emerald-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Ticker and Company */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-gray-900">
                          {result.ticker}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${getReportTypeColor(
                            result.report_type
                          )}`}
                        >
                          {getReportTypeLabel(result.report_type)}
                        </span>
                      </div>

                      {/* Title / Company Name */}
                      <div className="text-sm text-gray-700 font-medium mb-2">
                        {result.company_name || result.title}
                      </div>

                      {/* Snippet */}
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {result.snippet}
                      </p>
                    </div>

                    {/* Meta */}
                    <div className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDateTime(result.created_at)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Empty state */}
          {results.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <div className="text-3xl mb-2">🔍</div>
              <p className="text-sm text-gray-500">
                No reports match &quot;{query}&quot;
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Try searching for a ticker symbol, company name, or industry keyword
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
