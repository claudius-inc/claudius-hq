"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/format-date";

// Types
interface Position {
  symbol: string;
  quantity: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dayChangePct: number;
  marketValueBase?: number;
  unrealizedPnlBase?: number;
}

interface Summary {
  totalMarketValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPct: number;
  dayPnl: number;
  dayPnlPct: number;
}

interface MacroIndicator {
  id: string;
  name: string;
  category: string;
  data: { current: number } | null;
  interpretation: { label: string } | null;
}

interface StockReport {
  id: number;
  ticker: string;
  title: string;
  companyName?: string;
  createdAt: string;
}

interface SentimentData {
  vix: {
    value: number | null;
    change: number | null;
    level: "low" | "moderate" | "elevated" | "fear" | null;
  };
  putCall: {
    value: number | null;
    level: "greedy" | "neutral" | "fearful" | null;
  };
}

// Helper functions
function formatCurrency(value: number, currency = "SGD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getStatusColor(label: string): string {
  const colors: Record<string, string> = {
    "Target Zone": "bg-emerald-100 text-emerald-700",
    "At Target": "bg-emerald-100 text-emerald-700",
    "Healthy": "bg-emerald-100 text-emerald-700",
    "Normal": "bg-emerald-100 text-emerald-700",
    "Full Employment": "bg-emerald-100 text-emerald-700",
    "Expansion": "bg-emerald-100 text-emerald-700",
    "Accommodative": "bg-blue-100 text-blue-700",
    "Neutral": "bg-gray-100 text-gray-700",
    "Moderate": "bg-gray-100 text-gray-700",
    "Low": "bg-blue-100 text-blue-700",
    "Above Target": "bg-amber-100 text-amber-700",
    "Elevated": "bg-amber-100 text-amber-700",
    "Softening": "bg-amber-100 text-amber-700",
    "Restrictive": "bg-amber-100 text-amber-700",
    "Inverted": "bg-amber-100 text-amber-700",
    "Contraction": "bg-amber-100 text-amber-700",
    "High": "bg-red-100 text-red-700",
    "Very Restrictive": "bg-red-100 text-red-700",
    "Deeply Inverted": "bg-red-100 text-red-700",
    "Crisis": "bg-red-100 text-red-700",
  };
  return colors[label] || "bg-gray-100 text-gray-700";
}

// Dashboard Card Component
function DashboardCard({
  title,
  icon,
  children,
  href,
  loading,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  href?: string;
  loading?: boolean;
}) {
  const content = (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          <span>{icon}</span>
          {title}
        </h2>
        {href && (
          <span className="text-xs text-gray-400 hover:text-gray-600">
            View all →
          </span>
        )}
      </div>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        children
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}

// Quick Research Form Component
function QuickResearchForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/markets/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.toUpperCase().trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(`Research queued for ${ticker.toUpperCase()}`);
        setTicker("");
        setTimeout(() => {
          router.push("/markets/research");
        }, 1000);
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to queue research");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Enter ticker (e.g., AAPL)"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          disabled={status === "loading"}
        />
        <button
          type="submit"
          disabled={!ticker.trim() || status === "loading"}
          className="shrink-0 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {status === "loading" && <Spinner size="sm" className="text-white" />}
          {status === "loading" ? "..." : "🔬"}
        </button>
      </div>
      {message && (
        <div
          className={`text-xs mt-2 p-2 rounded ${
            status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}
    </form>
  );
}

// Sentiment level color helpers
function getSentimentColor(level: string | null | undefined): string {
  switch (level) {
    case "low":
    case "greedy":
      return "text-amber-600"; // Caution - could be complacent
    case "moderate":
    case "neutral":
      return "text-emerald-600"; // Healthy
    case "elevated":
    case "fearful":
    case "fear":
      return "text-red-600"; // Stress
    default:
      return "text-gray-500";
  }
}

function getSentimentBgColor(level: string | null | undefined): string {
  switch (level) {
    case "low":
    case "greedy":
      return "bg-amber-50 border-amber-200";
    case "moderate":
    case "neutral":
      return "bg-emerald-50 border-emerald-200";
    case "elevated":
    case "fearful":
    case "fear":
      return "bg-red-50 border-red-200";
    default:
      return "bg-gray-50 border-gray-200";
  }
}

function formatSentimentLevel(level: string | null | undefined): string {
  if (!level) return "—";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export default function StocksDashboard() {
  // State
  const [portfolioData, setPortfolioData] = useState<{
    positions: Position[];
    summary: Summary | null;
    baseCurrency: string;
  } | null>(null);
  const [macroIndicators, setMacroIndicators] = useState<MacroIndicator[]>([]);
  const [recentReports, setRecentReports] = useState<StockReport[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState({
    portfolio: true,
    macro: true,
    reports: true,
    sentiment: true,
  });

  // Fetch all data on mount
  useEffect(() => {
    // Fetch portfolio
    fetch("/api/ibkr/positions")
      .then((res) => res.json())
      .then((data) => {
        setPortfolioData({
          positions: data.positions || [],
          summary: data.summary || null,
          baseCurrency: data.baseCurrency || "SGD",
        });
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, portfolio: false })));

    // Fetch macro indicators
    fetch("/api/macro")
      .then((res) => res.json())
      .then((data) => {
        setMacroIndicators(data.indicators || []);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, macro: false })));

    // Fetch recent reports
    fetch("/api/markets/reports")
      .then((res) => res.json())
      .then((data) => {
        setRecentReports((data.reports || []).slice(0, 5));
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, reports: false })));

    // Fetch sentiment data
    fetch("/api/markets/sentiment")
      .then((res) => res.json())
      .then((data) => {
        setSentimentData({
          vix: data.vix || { value: null, change: null, level: null },
          putCall: data.putCall || { value: null, level: null },
        });
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, sentiment: false })));
  }, []);

  // Group macro indicators by category for organized display
  const macroByCategory = macroIndicators.reduce((acc, ind) => {
    if (!acc[ind.category]) acc[ind.category] = [];
    acc[ind.category].push(ind);
    return acc;
  }, {} as Record<string, MacroIndicator[]>);
  
  const categoryOrder = ["rates", "inflation", "employment", "growth", "credit"];
  const categoryIcons: Record<string, string> = {
    rates: "📈",
    inflation: "🔥",
    employment: "👷",
    growth: "🏭",
    credit: "💳",
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📊 Stocks Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Portfolio overview, research, and market signals
        </p>
      </div>

      {/* Market Pulse - Sentiment Card */}
      <div className={`mb-6 p-4 rounded-xl border ${
        loading.sentiment 
          ? "bg-gray-50 border-gray-200" 
          : getSentimentBgColor(sentimentData?.vix.level || sentimentData?.putCall.level)
      }`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🌡️</span>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Market Pulse
          </h2>
        </div>
        {loading.sentiment ? (
          <div className="flex gap-6">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-32" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-6">
            {/* VIX */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">VIX:</span>
              <span className={`text-lg font-bold ${getSentimentColor(sentimentData?.vix.level)}`}>
                {sentimentData?.vix.value?.toFixed(1) ?? "—"}
              </span>
              {sentimentData?.vix?.change != null && (
                <span className={`text-xs ${sentimentData.vix.change >= 0 ? "text-red-500" : "text-green-500"}`}>
                  ({sentimentData.vix.change >= 0 ? "+" : ""}{sentimentData.vix.change.toFixed(1)})
                </span>
              )}
              <span className={`text-sm font-medium ${getSentimentColor(sentimentData?.vix.level)}`}>
                ({formatSentimentLevel(sentimentData?.vix.level)})
              </span>
            </div>
            {/* Put/Call */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">Put/Call:</span>
              <span className={`text-lg font-bold ${getSentimentColor(sentimentData?.putCall.level)}`}>
                {sentimentData?.putCall.value?.toFixed(2) ?? "—"}
              </span>
              <span className={`text-sm font-medium ${getSentimentColor(sentimentData?.putCall.level)}`}>
                ({formatSentimentLevel(sentimentData?.putCall.level)})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick Research */}
        <DashboardCard title="Quick Research" icon="🔬">
          <QuickResearchForm />
          <p className="text-xs text-gray-400 mt-3">
            Start a Sun Tzu-style research report for any ticker
          </p>
        </DashboardCard>

        {/* Portfolio Summary */}
        <DashboardCard
          title="Portfolio Summary"
          icon="💼"
          href="/markets/portfolio"
          loading={loading.portfolio}
        >
          {portfolioData?.summary ? (
            <div className="space-y-3">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatCurrency(
                    portfolioData.summary.totalMarketValue,
                    portfolioData.baseCurrency
                  )}
                </div>
                <div className="text-xs text-gray-500">Total Market Value</div>
              </div>
              <div className="flex gap-4">
                <div>
                  <div
                    className={`text-lg font-semibold ${
                      portfolioData.summary.dayPnl >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(
                      portfolioData.summary.dayPnl,
                      portfolioData.baseCurrency
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Day P&L</div>
                </div>
                <div>
                  <div
                    className={`text-lg font-semibold ${
                      portfolioData.summary.totalUnrealizedPnl >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatPct(portfolioData.summary.totalUnrealizedPnlPct)}
                  </div>
                  <div className="text-xs text-gray-500">Unrealized</div>
                </div>
              </div>
              {portfolioData.positions.length > 0 && (
                <div className="text-xs text-gray-400 pt-2 border-t">
                  {portfolioData.positions.length} position
                  {portfolioData.positions.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              <p>No portfolio data yet.</p>
              <Link
                href="/markets/portfolio"
                className="text-blue-600 hover:underline text-xs"
              >
                Import IBKR statement →
              </Link>
            </div>
          )}
        </DashboardCard>

        {/* Macro Signals - Full Width */}
        <div className="md:col-span-2">
          <DashboardCard
            title="Macro Signals"
            icon="🌍"
            href="/markets/macro"
            loading={loading.macro}
          >
            {macroIndicators.length > 0 ? (
              <div className="space-y-4">
                {categoryOrder.map((category) => {
                  const indicators = macroByCategory[category];
                  if (!indicators?.length) return null;
                  return (
                    <div key={category}>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <span>{categoryIcons[category]}</span>
                        {category}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {indicators.map((indicator) => (
                          <div
                            key={indicator.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                          >
                            <span className="text-xs text-gray-600 truncate mr-2">
                              {indicator.name.replace(" (YoY)", "").replace(" Rate", "")}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {indicator.data && (
                                <span className="text-xs font-medium text-gray-900">
                                  {indicator.id === "initial-claims" 
                                    ? `${(indicator.data.current / 1000).toFixed(0)}K`
                                    : indicator.id === "pmi-manufacturing"
                                    ? indicator.data.current.toLocaleString()
                                    : indicator.id === "hy-spread"
                                    ? `${indicator.data.current.toFixed(0)}bp`
                                    : indicator.id === "yield-curve"
                                    ? `${indicator.data.current.toFixed(0)}bp`
                                    : `${indicator.data.current.toFixed(1)}%`}
                                </span>
                              )}
                              {indicator.interpretation && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${getStatusColor(
                                    indicator.interpretation.label
                                  )}`}
                                >
                                  {indicator.interpretation.label}
                                </span>
                              )}
                              {!indicator.data && (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                <p>No macro data available.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Add FRED_API_KEY for live data
                </p>
              </div>
            )}
          </DashboardCard>
        </div>

        {/* Recent Research */}
        <DashboardCard
          title="Recent Research"
          icon="📄"
          href="/markets/research"
          loading={loading.reports}
        >
          {recentReports.length > 0 ? (
            <div className="space-y-2">
              {recentReports.map((report) => (
                <Link
                  key={report.id}
                  href={`/markets/${report.ticker.toLowerCase()}`}
                  className="block py-1.5 hover:bg-gray-50 -mx-2 px-2 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{report.ticker}</span>
                    {report.companyName && (
                      <span className="text-xs text-gray-500 truncate max-w-[150px]">
                        {report.companyName}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatDate(report.createdAt, { style: 'date-only' })}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              <p>No research reports yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Use the form above to start one
              </p>
            </div>
          )}
        </DashboardCard>

        {/* Quick Links */}
        <DashboardCard title="Quick Actions" icon="⚡">
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/markets/themes"
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span>🎯</span>
              <span className="text-sm font-medium">Themes</span>
            </Link>
            <Link
              href="/markets/sectors"
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span>📊</span>
              <span className="text-sm font-medium">Sectors</span>
            </Link>
            <Link
              href="/markets/macro"
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span>🌍</span>
              <span className="text-sm font-medium">Macro</span>
            </Link>
            <Link
              href="/markets/portfolio"
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span>💼</span>
              <span className="text-sm font-medium">Portfolio</span>
            </Link>
          </div>
        </DashboardCard>
      </div>
    </>
  );
}
