"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/Skeleton";
import { PageHero } from "@/components/PageHero";
import { Spinner } from "@/components/ui/Spinner";
import {
  Search,
  Globe,
  FileText,
  FlaskConical,
  TrendingUp,
  Flame,
  HardHat,
  Factory,
  CreditCard,
  Activity,
} from "lucide-react";
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

interface MarketEtf {
  ticker: string;
  name: string;
  data: {
    price: number;
    change: number;
    changePercent: number;
    rangePosition: number;
    fiftyTwoWeekLow: number;
    fiftyTwoWeekHigh: number;
  } | null;
  interpretation: { label: string; color: string } | null;
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

// ── Helpers ──────────────────────────────────────────

function getStatusColor(label: string): string {
  const colors: Record<string, string> = {
    "Target Zone": "bg-emerald-100 text-emerald-700",
    "At Target": "bg-emerald-100 text-emerald-700",
    Healthy: "bg-emerald-100 text-emerald-700",
    Normal: "bg-emerald-100 text-emerald-700",
    "Full Employment": "bg-emerald-100 text-emerald-700",
    Expansion: "bg-emerald-100 text-emerald-700",
    Accommodative: "bg-blue-100 text-blue-700",
    Neutral: "bg-gray-100 text-gray-700",
    Moderate: "bg-gray-100 text-gray-700",
    Low: "bg-blue-100 text-blue-700",
    "Above Target": "bg-amber-100 text-amber-700",
    Elevated: "bg-amber-100 text-amber-700",
    Softening: "bg-amber-100 text-amber-700",
    Restrictive: "bg-amber-100 text-amber-700",
    Inverted: "bg-amber-100 text-amber-700",
    Contraction: "bg-amber-100 text-amber-700",
    High: "bg-red-100 text-red-700",
    "Very Restrictive": "bg-red-100 text-red-700",
    "Deeply Inverted": "bg-red-100 text-red-700",
    Crisis: "bg-red-100 text-red-700",
  };
  return colors[label] || "bg-gray-100 text-gray-700";
}

function getStatusTileBg(label: string): string {
  const colors: Record<string, string> = {
    "Target Zone": "bg-emerald-50",
    "At Target": "bg-emerald-50",
    Healthy: "bg-emerald-50",
    Normal: "bg-emerald-50",
    "Full Employment": "bg-emerald-50",
    Expansion: "bg-emerald-50",
    Accommodative: "bg-blue-50",
    Neutral: "bg-gray-50",
    Moderate: "bg-gray-50",
    Low: "bg-blue-50",
    "Above Target": "bg-amber-50",
    Elevated: "bg-amber-50",
    Softening: "bg-amber-50",
    Restrictive: "bg-amber-50",
    Inverted: "bg-amber-50",
    Contraction: "bg-amber-50",
    High: "bg-red-50",
    "Very Restrictive": "bg-red-50",
    "Deeply Inverted": "bg-red-50",
    Crisis: "bg-red-50",
  };
  return colors[label] || "bg-gray-50";
}

function formatSentimentLevel(level: string | null | undefined): string {
  if (!level) return "—";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function formatIndicatorValue(indicator: MacroIndicator): string {
  if (!indicator.data) return "—";
  const val = indicator.data.current;
  if (indicator.id === "initial-claims") return `${(val / 1000).toFixed(0)}K`;
  if (indicator.id === "pmi-manufacturing") return val.toLocaleString();
  if (indicator.id === "hy-spread") return `${val.toFixed(0)}bp`;
  if (indicator.id === "yield-curve") return `${val.toFixed(0)}bp`;
  return `${val.toFixed(1)}%`;
}

const categoryOrder = ["rates", "inflation", "employment", "growth", "credit"];

const categoryLabels: Record<string, string> = {
  rates: "Rates",
  inflation: "Inflation",
  employment: "Employment",
  growth: "Growth",
  credit: "Credit",
};

const categoryIcons: Record<string, React.ReactNode> = {
  rates: <TrendingUp className="w-3 h-3" />,
  inflation: <Flame className="w-3 h-3" />,
  employment: <HardHat className="w-3 h-3" />,
  growth: <Factory className="w-3 h-3" />,
  credit: <CreditCard className="w-3 h-3" />,
};

// ── Dashboard Card ───────────────────────────────────

function DashboardCard({
  title,
  icon,
  children,
  href,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  href?: string;
  loading?: boolean;
}) {
  const content = (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          <span className="flex items-center">{icon}</span>
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

// ── Quick Research Form ──────────────────────────────

function QuickResearchForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/stocks/research", {
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
          autoCapitalize="characters"
          autoComplete="off"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          disabled={status === "loading"}
        />
        <button
          type="submit"
          disabled={!ticker.trim() || status === "loading"}
          className="shrink-0 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {status === "loading" && <Spinner size="sm" className="text-white" />}
          {status === "loading" ? "..." : <FlaskConical className="w-4 h-4" />}
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

// ── Macro Indicator Tile ─────────────────────────────

function IndicatorTile({ indicator }: { indicator: MacroIndicator }) {
  const label = indicator.interpretation?.label;
  const tileBg = label ? getStatusTileBg(label) : "bg-gray-50";
  const pillColor = label ? getStatusColor(label) : "bg-gray-100 text-gray-500";

  return (
    <div
      className={`rounded-xl p-3 ${tileBg} border border-white/60 transition-transform hover:scale-[1.02]`}
    >
      <div className="flex items-center gap-1 mb-1.5">
        <span className="flex items-center text-gray-400">
          {categoryIcons[indicator.category]}
        </span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          {categoryLabels[indicator.category] || indicator.category}
        </span>
      </div>
      <div className="text-xs text-gray-600 mb-1 leading-tight">
        {indicator.name.replace(" (YoY)", "").replace(" Rate", "")}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold text-gray-900">
          {formatIndicatorValue(indicator)}
        </span>
        {label && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${pillColor}`}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────

export default function StocksDashboard() {
  // State
  const [portfolioData, setPortfolioData] = useState<{
    positions: Position[];
    summary: Summary | null;
    baseCurrency: string;
  } | null>(null);
  const [macroIndicators, setMacroIndicators] = useState<MacroIndicator[]>([]);
  const [recentReports, setRecentReports] = useState<StockReport[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(
    null,
  );
  const [marketEtfs, setMarketEtfs] = useState<MarketEtf[]>([]);
  const [loading, setLoading] = useState({
    portfolio: true,
    macro: true,
    reports: true,
    sentiment: true,
    etfs: true,
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

    // Fetch market ETFs (TLT etc)
    fetch("/api/macro/etfs")
      .then((res) => res.json())
      .then((data) => {
        setMarketEtfs(data.etfs || []);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, etfs: false })));

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

  // Group and flatten macro indicators
  const macroByCategory = macroIndicators.reduce(
    (acc, ind) => {
      if (!acc[ind.category]) acc[ind.category] = [];
      acc[ind.category].push(ind);
      return acc;
    },
    {} as Record<string, MacroIndicator[]>,
  );

  const allIndicators: MacroIndicator[] = [];
  categoryOrder.forEach((cat) => {
    if (macroByCategory[cat]) allIndicators.push(...macroByCategory[cat]);
  });

  return (
    <>
      <PageHero
        title="Markets Dashboard"
        subtitle="Portfolio overview, research, and market signals"
      />

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick Research */}
        <DashboardCard
          title="Quick Research"
          icon={<Search className="w-4 h-4" />}
        >
          <QuickResearchForm />
          <p className="text-xs text-gray-400 mt-3">
            Start a Sun Tzu-style research report for any ticker
          </p>
        </DashboardCard>

        {/* Macro Signals */}

        <DashboardCard
          title="Macro Signals"
          icon={<Globe className="w-4 h-4" />}
          href="/markets/macro"
        >
          <div className="space-y-4">
            {/* Sentiment Status Bar */}
            {loading.sentiment ? (
              <Skeleton className="h-14 rounded-xl" />
            ) : (
              <div className="rounded-xl bg-gray-900 p-3 sm:p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Activity className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase tracking-wider">
                      Market Pulse
                    </span>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6">
                    {/* VIX */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">VIX</span>
                      <span
                        className={`text-lg font-bold ${
                          sentimentData?.vix.level === "low" ||
                          sentimentData?.vix.level === "moderate"
                            ? "text-emerald-400"
                            : sentimentData?.vix.level === "elevated"
                              ? "text-amber-400"
                              : sentimentData?.vix.level === "fear"
                                ? "text-red-400"
                                : "text-gray-400"
                        }`}
                      >
                        {sentimentData?.vix.value?.toFixed(1) ?? "—"}
                      </span>
                      {sentimentData?.vix?.change != null && (
                        <span
                          className={`text-xs ${sentimentData.vix.change >= 0 ? "text-red-400" : "text-emerald-400"}`}
                        >
                          {sentimentData.vix.change >= 0 ? "▲" : "▼"}
                          {Math.abs(sentimentData.vix.change).toFixed(1)}
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          sentimentData?.vix.level === "low" ||
                          sentimentData?.vix.level === "moderate"
                            ? "bg-emerald-900/50 text-emerald-300"
                            : sentimentData?.vix.level === "elevated"
                              ? "bg-amber-900/50 text-amber-300"
                              : sentimentData?.vix.level === "fear"
                                ? "bg-red-900/50 text-red-300"
                                : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {formatSentimentLevel(sentimentData?.vix.level)}
                      </span>
                    </div>

                    <div className="w-px h-6 bg-gray-700" />

                    {/* Put/Call */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">P/C</span>
                      <span
                        className={`text-lg font-bold ${
                          sentimentData?.putCall.level === "greedy"
                            ? "text-amber-400"
                            : sentimentData?.putCall.level === "neutral"
                              ? "text-emerald-400"
                              : sentimentData?.putCall.level === "fearful"
                                ? "text-red-400"
                                : "text-gray-400"
                        }`}
                      >
                        {sentimentData?.putCall.value?.toFixed(2) ?? "—"}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          sentimentData?.putCall.level === "greedy"
                            ? "bg-amber-900/50 text-amber-300"
                            : sentimentData?.putCall.level === "neutral"
                              ? "bg-emerald-900/50 text-emerald-300"
                              : sentimentData?.putCall.level === "fearful"
                                ? "bg-red-900/50 text-red-300"
                                : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {formatSentimentLevel(sentimentData?.putCall.level)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Heatmap Grid */}
            {loading.macro ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : allIndicators.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {allIndicators.map((indicator) => (
                  <IndicatorTile key={indicator.id} indicator={indicator} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500">
                <p>No macro data available.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Add FRED_API_KEY for live data
                </p>
              </div>
            )}

            {/* Barometers */}
            {marketEtfs.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  Barometers
                </div>
                {loading.etfs ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {marketEtfs.map((etf) => {
                      const etfBg =
                        etf.interpretation?.color === "blue"
                          ? "bg-blue-50"
                          : etf.interpretation?.color === "amber"
                            ? "bg-amber-50"
                            : etf.interpretation?.color === "red"
                              ? "bg-red-50"
                              : "bg-gray-50";
                      const etfLabelColor =
                        etf.interpretation?.color === "blue"
                          ? "bg-blue-100 text-blue-700"
                          : etf.interpretation?.color === "amber"
                            ? "bg-amber-100 text-amber-700"
                            : etf.interpretation?.color === "red"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-700";
                      return (
                        <div
                          key={etf.ticker}
                          className={`rounded-xl p-3 ${etfBg} border border-white/60`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-900">
                              {etf.ticker}
                            </span>
                            {etf.interpretation && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full ${etfLabelColor}`}
                              >
                                {etf.interpretation.label}
                              </span>
                            )}
                          </div>
                          {etf.data ? (
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-sm font-bold text-gray-900">
                                ${etf.data.price.toFixed(2)}
                              </span>
                              <span
                                className={`text-xs font-medium ${etf.data.change >= 0 ? "text-emerald-600" : "text-red-600"}`}
                              >
                                {etf.data.changePercent >= 0 ? "+" : ""}
                                {etf.data.changePercent.toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </DashboardCard>

        {/* Recent Research */}
        <DashboardCard
          title="Recent Research"
          icon={<FileText className="w-4 h-4" />}
          href="/markets/research"
          loading={loading.reports}
        >
          {recentReports.length > 0 ? (
            <div className="space-y-2">
              {recentReports.map((report) => (
                <div
                  key={report.id}
                  className="block py-1.5 -mx-2 px-2 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{report.ticker}</span>
                    {report.companyName && (
                      <span className="text-xs text-gray-500 truncate md:whitespace-normal md:overflow-visible">
                        {report.companyName}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatDate(report.createdAt, { style: "date-only" })}
                  </div>
                </div>
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
      </div>
    </>
  );
}
