"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Search, Clock, TrendingUp, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Select } from "@/components/ui/Select";
import type { ParsedScan, ScanResult } from "../types";

interface Props {
  scan: ParsedScan | null;
}

type TierFilter = "all" | "high" | "speculative" | "watchlist";
type RiskFilter = "all" | "TIER 1" | "TIER 2" | "TIER 3";
type MarketFilter = "all" | "US" | "SGX" | "HK" | "JP";

function getTierBadgeColor(tier: string): string {
  if (tier.includes("HIGH CONVICTION")) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (tier.includes("SPECULATIVE")) return "bg-amber-100 text-amber-800 border-amber-200";
  if (tier.includes("WATCHLIST")) return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-gray-100 text-gray-800 border-gray-200";
}

function getRiskBadgeColor(risk: string): string {
  if (risk === "TIER 1") return "bg-emerald-50 text-emerald-700";
  if (risk === "TIER 2") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  if (score >= 35) return "text-blue-600";
  return "text-gray-600";
}

function getMarketBadgeColor(market: string): string {
  if (market === "US") return "bg-indigo-50 text-indigo-700";
  return "bg-teal-50 text-teal-700";
}

function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return "-";
  return value.toFixed(decimals);
}

function ScoreBar({ score, max, label }: { score: number; max: number; label: string }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-gray-500">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-gray-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right text-gray-600">{score}/{max}</span>
    </div>
  );
}

function CompositeScoreBar({ score, label }: { score: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-gray-500">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            score >= 70 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : score >= 35 ? "bg-blue-500" : "bg-gray-400"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-10 text-right font-medium text-gray-700">{score}</span>
    </div>
  );
}

function StockRow({ stock, isExpanded, onToggle }: {
  stock: ScanResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasEnhancedData = stock.compositeScore !== undefined;
  const displayScore = stock.compositeScore ?? stock.totalScore;

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* Main row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <button className="p-0.5 text-gray-400 hover:text-gray-600">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <span className="w-8 text-xs text-gray-400 text-right">#{stock.rank}</span>

        <Link
          href={`/markets/research/${stock.ticker}`}
          className="w-16 font-mono font-medium text-gray-900 hover:text-emerald-600 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {stock.ticker}
        </Link>

        {stock.market && (
          <span className={`px-1 py-0.5 text-[9px] font-medium rounded ${getMarketBadgeColor(stock.market)}`}>
            {stock.market}
          </span>
        )}

        <span className="flex-1 truncate text-sm text-gray-600 hidden sm:block">
          {stock.name}
        </span>

        <span className={`w-12 text-right font-semibold ${getScoreColor(displayScore)}`}>
          {displayScore}
        </span>

        <span className={`px-2 py-0.5 text-[10px] font-medium rounded border ${getTierBadgeColor(stock.tier)}`}>
          {stock.tier.replace(/🔥|⚡|👀|⚠️/g, "").trim().split(" ")[0]}
        </span>

        <span className={`px-1.5 py-0.5 text-[10px] rounded hidden sm:inline ${getRiskBadgeColor(stock.riskTier)}`}>
          {stock.riskTier}
        </span>

        <span className="w-20 text-right text-sm text-gray-500 hidden md:block">
          ${stock.price?.toFixed(2) || "N/A"}
        </span>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100 space-y-3">
          {/* Mobile-only name */}
          <p className="text-sm text-gray-700 sm:hidden">{stock.name}</p>

          {/* Key metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-500">Market Cap</span>
              <p className="font-medium">${stock.mcapB}B</p>
            </div>
            <div>
              <span className="text-gray-500">Price</span>
              <p className="font-medium">${stock.price?.toFixed(2) || "N/A"}</p>
            </div>
            <div>
              <span className="text-gray-500">Rev Growth</span>
              <p className={`font-medium ${(stock.revGrowth || 0) > 0 ? "text-emerald-600" : "text-gray-600"}`}>
                {stock.revGrowth ? `${(stock.revGrowth * 100).toFixed(0)}%` : "N/A"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Gross Margin</span>
              <p className="font-medium">
                {stock.grossMargin ? `${(stock.grossMargin * 100).toFixed(0)}%` : "N/A"}
              </p>
            </div>
          </div>

          {/* Enhanced technical metrics */}
          {hasEnhancedData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t border-gray-200 pt-3">
              <div>
                <span className="text-gray-500">ATH (W)</span>
                <p className="font-medium">${formatNumber(stock.athWeekly)}</p>
              </div>
              <div>
                <span className="text-gray-500">ATH (M)</span>
                <p className="font-medium">${formatNumber(stock.athMonthly)}</p>
              </div>
              <div>
                <span className="text-gray-500">RVOL (W)</span>
                <p className={`font-medium ${(stock.rvolWeekly || 0) >= 1.5 ? "text-emerald-600" : "text-gray-600"}`}>
                  {formatNumber(stock.rvolWeekly, 2)}x
                </p>
              </div>
              <div>
                <span className="text-gray-500">R/R (W)</span>
                <p className={`font-medium ${(stock.rrWeekly || 0) >= 2 ? "text-emerald-600" : "text-gray-600"}`}>
                  {formatNumber(stock.rrWeekly, 2)}
                </p>
              </div>
            </div>
          )}

          {/* Composite scoring breakdown */}
          {hasEnhancedData && (
            <div className="space-y-1.5 border-t border-gray-200 pt-3">
              <h4 className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <TrendingUp size={12} />
                Composite Score Breakdown
              </h4>
              <CompositeScoreBar score={stock.fundamentalScore ?? 0} label="Fundamentals" />
              <CompositeScoreBar score={stock.technicalScore ?? 0} label="Technical" />
              <CompositeScoreBar score={stock.momentumScore ?? 0} label="Momentum" />
            </div>
          )}

          {/* Original scoring breakdown */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-gray-700">Base Score Breakdown</h4>
            <ScoreBar score={stock.growth.score} max={stock.growth.max} label="Growth" />
            <ScoreBar score={stock.financial.score} max={stock.financial.max} label="Financial" />
            <ScoreBar score={stock.insider.score} max={stock.insider.max} label="Insider" />
            <ScoreBar score={stock.technical.score} max={stock.technical.max} label="Technical" />
            <ScoreBar score={stock.analyst.score} max={stock.analyst.max} label="Analyst" />
          </div>

          {/* Score details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Growth Details:</span>
              <p className="text-gray-700">{stock.growth.details.join(", ") || "N/A"}</p>
            </div>
            <div>
              <span className="text-gray-500">Financial Details:</span>
              <p className="text-gray-700">{stock.financial.details.join(", ") || "N/A"}</p>
            </div>
            <div>
              <span className="text-gray-500">Technical:</span>
              <p className="text-gray-700">{stock.technical.details.join(", ") || "N/A"}</p>
            </div>
            <div>
              <span className="text-gray-500">Analyst Sentiment:</span>
              <p className="text-gray-700">{stock.analyst.details.join(", ") || "N/A"}</p>
            </div>
          </div>

          {/* Risk flags */}
          {stock.risk.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-gray-500">Risks:</span>
              {stock.risk.flags.map((flag, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 text-[10px] bg-red-50 text-red-700 rounded"
                >
                  {flag}
                </span>
              ))}
              {stock.risk.penalty !== 0 && (
                <span className="text-xs text-red-600">
                  ({stock.risk.penalty} pts)
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ScannerResults({ scan }: Props) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  if (!scan) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">No scan results available</p>
        <p className="text-sm text-gray-400 mt-1">
          Run the scanner with --upload flag to save results
        </p>
      </div>
    );
  }

  // Use composite score for filtering if available
  const hasEnhancedData = scan.results.some(r => r.compositeScore !== undefined);
  const getDisplayScore = (stock: ScanResult) => stock.compositeScore ?? stock.totalScore;

  const filteredResults = scan.results.filter((stock) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!stock.ticker.toLowerCase().includes(q) && !stock.name.toLowerCase().includes(q)) {
        return false;
      }
    }
    // Tier filter (use display score for enhanced data)
    const score = getDisplayScore(stock);
    if (tierFilter === "high" && score < 70) return false;
    if (tierFilter === "speculative" && (score < 50 || score >= 70)) return false;
    if (tierFilter === "watchlist" && (score < 35 || score >= 50)) return false;
    // Risk filter
    if (riskFilter !== "all" && stock.riskTier !== riskFilter) return false;
    // Market filter
    if (marketFilter !== "all" && stock.market !== marketFilter) return false;
    return true;
  });

  const toggleRow = (ticker: string) => {
    const next = new Set(expandedRows);
    if (next.has(ticker)) {
      next.delete(ticker);
    } else {
      next.add(ticker);
    }
    setExpandedRows(next);
  };

  const scannedAt = scan.scannedAt ? new Date(scan.scannedAt) : null;

  const usCount = scan.summary?.usCount ?? scan.results.filter((r) => r.market === "US").length;
  const sgxCount = scan.summary?.sgxCount ?? scan.results.filter((r) => r.market === "SGX").length;
  const hkCount = scan.summary?.hkCount ?? scan.results.filter((r) => r.market === "HK").length;
  const jpCount = scan.summary?.jpCount ?? scan.results.filter((r) => r.market === "JP").length;

  return (
    <div className="space-y-4">
      {/* Scan info & summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-4">
          {scannedAt && (
            <span className="flex items-center gap-1 text-gray-500">
              <Clock size={14} />
              Updated{" "}
              <span className="font-medium text-gray-700">
                {formatDistanceToNow(scannedAt, { addSuffix: true })}
              </span>
            </span>
          )}
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">
            {scan.results.length} stocks
            {scan.results.length > 0 && (
              <span className="text-gray-400">
                {" "}({[
                  usCount > 0 && `US: ${usCount}`,
                  sgxCount > 0 && `SGX: ${sgxCount}`,
                  hkCount > 0 && `HK: ${hkCount}`,
                  jpCount > 0 && `JP: ${jpCount}`,
                ].filter(Boolean).join(", ")})
              </span>
            )}
          </span>
          {hasEnhancedData && (
            <>
              <span className="text-gray-400">|</span>
              <span className="px-1.5 py-0.5 text-[10px] bg-violet-100 text-violet-700 rounded font-medium">
                Enhanced
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {scan.summary && (
            <div className="flex gap-2 text-xs">
              <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded">
                HC {scan.summary.highConviction}
              </span>
              <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded">
                SPEC {scan.summary.speculative}
              </span>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                WL {scan.summary.watchlist}
              </span>
            </div>
          )}

          <span className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 bg-gray-50 rounded">
            <Zap size={12} />
            Auto-updated every 6h
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search ticker or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="flex gap-2">
          <Select
            value={marketFilter}
            onChange={(val) => setMarketFilter(val as MarketFilter)}
            options={[
              { value: "all", label: "All Markets" },
              { value: "US", label: "US" },
              { value: "SGX", label: "SGX" },
              { value: "HK", label: "HK" },
              { value: "JP", label: "Japan" },
            ]}
          />

          <Select
            value={tierFilter}
            onChange={(val) => setTierFilter(val as TierFilter)}
            options={[
              { value: "all", label: "All Tiers" },
              { value: "high", label: "High Conviction" },
              { value: "speculative", label: "Speculative" },
              { value: "watchlist", label: "Watchlist" },
            ]}
          />

          <Select
            value={riskFilter}
            onChange={(val) => setRiskFilter(val as RiskFilter)}
            options={[
              { value: "all", label: "All Risks" },
              { value: "TIER 1", label: "Tier 1 (Low)" },
              { value: "TIER 2", label: "Tier 2 (Med)" },
              { value: "TIER 3", label: "Tier 3 (High)" },
            ]}
          />
        </div>
      </div>

      {/* Results table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header - with horizontal scroll wrapper */}
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
              <span className="w-6" /> {/* Expand button */}
              <span className="w-8 text-right">#</span>
              <span className="w-16">Ticker</span>
              <span className="w-8">Mkt</span>
              <span className="flex-1">Name</span>
              <span className="w-12 text-right">Score</span>
              <span className="w-20">Tier</span>
              <span className="w-14">Risk</span>
              <span className="w-20 text-right">Price</span>
              {hasEnhancedData && (
                <>
                  <span className="w-16 text-right">ATH(W)</span>
                  <span className="w-14 text-right">RVOL</span>
                  <span className="w-14 text-right">R/R</span>
                </>
              )}
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-100">
              {filteredResults.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                  No stocks match your filters
                </div>
              ) : (
                filteredResults.map((stock) => (
                  <StockRow
                    key={stock.ticker}
                    stock={stock}
                    isExpanded={expandedRows.has(stock.ticker)}
                    onToggle={() => toggleRow(stock.ticker)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
