"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Search,
  SlidersHorizontal,
  TrendingUp,
  X,
} from "lucide-react";

import { Select } from "@/components/ui/Select";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/HoverCard";
import { formatLocalPrice } from "@/lib/markets/yahoo-utils";
import type { ParsedScan, ScanResult, ScoreComponent } from "../types";

interface Props {
  scan: ParsedScan | null;
}

type ScoringMode = "combined" | "quant" | "value" | "growth";
type TierFilter = "all" | "high" | "speculative" | "watchlist";
type RiskFilter = "all" | "TIER 1" | "TIER 2" | "TIER 3";
type MarketFilter = "all" | "US" | "SGX" | "HK" | "JP" | "CN" | "LSE";

const SCORING_MODES: { value: ScoringMode; label: string }[] = [
  { value: "combined", label: "Combined" },
  { value: "quant", label: "Quant" },
  { value: "value", label: "Value" },
  { value: "growth", label: "Growth" },
];

function getTierBadgeColor(tier: string): string {
  if (tier.includes("HIGH CONVICTION"))
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (tier.includes("SPECULATIVE"))
    return "bg-amber-100 text-amber-800 border-amber-200";
  if (tier.includes("WATCHLIST"))
    return "bg-blue-100 text-blue-800 border-blue-200";
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
  if (market === "LSE") return "bg-rose-50 text-rose-700";
  return "bg-teal-50 text-teal-700";
}

// Color coding for Q/V/G scores: ≥70 green, 50-69 yellow, <50 red
function getModeScoreColor(score: number | undefined): string {
  if (score === undefined) return "text-gray-400";
  if (score >= 70) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-500";
}

function getModeScoreBgColor(score: number | undefined): string {
  if (score === undefined) return "bg-gray-100";
  if (score >= 70) return "bg-emerald-50";
  if (score >= 50) return "bg-amber-50";
  return "bg-red-50";
}

// Hover card component for score breakdown
function ScoreBreakdownCard({
  title,
  score,
  breakdown,
}: {
  title: string;
  score: number | undefined;
  breakdown: ScoreComponent | undefined;
}) {
  if (score === undefined) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
        <span className="font-semibold text-gray-900">{title}</span>
        <span className={`font-bold ${getModeScoreColor(score)}`}>
          {score}/100
        </span>
      </div>
      {breakdown && Object.keys(breakdown).length > 0 ? (
        <div className="space-y-1.5">
          {Object.entries(breakdown).map(([category, { score: s, max }]) => (
            <div
              key={category}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-gray-600">{category}</span>
              <span className="font-medium text-gray-800">
                {s}/{max}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No breakdown available</p>
      )}
    </div>
  );
}

// Score cell with hover card
function ModeScoreCell({
  label,
  score,
  breakdown,
}: {
  label: string;
  score: number | undefined;
  breakdown: ScoreComponent | undefined;
}) {
  if (score === undefined) {
    return <span className="text-gray-300">-</span>;
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          className={`px-1.5 py-0.5 rounded text-xs font-medium cursor-help transition-colors ${getModeScoreBgColor(score)} ${getModeScoreColor(score)} hover:opacity-80`}
          onClick={(e) => e.stopPropagation()}
        >
          {score}
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-48 p-3">
        <ScoreBreakdownCard title={label} score={score} breakdown={breakdown} />
      </HoverCardContent>
    </HoverCard>
  );
}

function formatNumber(
  value: number | null | undefined,
  decimals: number = 2,
): string {
  if (value === null || value === undefined) return "-";
  return value.toFixed(decimals);
}

function ScoreBar({
  score,
  max,
  label,
  color,
}: {
  score: number;
  max: number;
  label: string;
  color: string;
}) {
  const pct = Math.round((score / max) * 100);
  return (
    <div className="flex items-center gap-1.5 text-xs min-w-0">
      <span className="text-gray-600 font-medium shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[40px]">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-gray-700 font-medium shrink-0">
        {score}/{max}
      </span>
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
            score >= 70
              ? "bg-emerald-500"
              : score >= 50
                ? "bg-amber-500"
                : score >= 35
                  ? "bg-blue-500"
                  : "bg-gray-400"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-10 text-right font-medium text-gray-700">{score}</span>
    </div>
  );
}

function StockRow({
  stock,
  isExpanded,
  onToggle,
  displayScore,
  displayRank,
}: {
  stock: ScanResult;
  isExpanded: boolean;
  onToggle: () => void;
  displayScore: number;
  displayRank: number;
}) {
  const hasEnhancedData = stock.compositeScore !== undefined;

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* Main row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <span className="w-6 flex items-center justify-center text-gray-400 hover:text-gray-600">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>

        <span className="w-8 text-xs text-gray-400 text-right">
          #{displayRank}
        </span>

        <Link
          href={`/markets/ticker/${stock.ticker}`}
          className="w-16 font-mono font-medium text-gray-900 hover:text-emerald-600 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {stock.ticker}
        </Link>

        <span className="w-32 sm:flex-1 min-w-0 truncate text-sm text-gray-600">
          {stock.name}
        </span>

        {/* Combined score (main score, bold) */}
        <span
          className={`w-12 text-right font-bold ${getScoreColor(displayScore)}`}
        >
          {displayScore}
        </span>

        {/* Q/V/G scores with hover cards - hidden on mobile */}
        <div className="hidden md:flex items-center gap-1.5">
          <span className="w-8 flex justify-center">
            <ModeScoreCell
              label="Quant"
              score={stock.quantScore}
              breakdown={stock.quantBreakdown}
            />
          </span>
          <span className="w-8 flex justify-center">
            <ModeScoreCell
              label="Value"
              score={stock.valueScore}
              breakdown={stock.valueBreakdown}
            />
          </span>
          <span className="w-8 flex justify-center">
            <ModeScoreCell
              label="Growth"
              score={stock.growthScore}
              breakdown={stock.growthBreakdown}
            />
          </span>
        </div>

        <span className="w-16 flex items-center">
          <span
            className={`px-2 py-0.5 text-[10px] font-medium rounded border ${getTierBadgeColor(stock.tier)}`}
          >
            {stock.tier.includes("HIGH CONVICTION")
              ? "HC"
              : stock.tier.includes("SPECULATIVE")
                ? "SPEC"
                : stock.tier.includes("WATCHLIST")
                  ? "WL"
                  : "—"}
          </span>
        </span>

        <span className="w-10 hidden sm:flex items-center">
          {stock.market && (
            <span
              className={`px-1 py-0.5 text-[9px] font-medium rounded ${getMarketBadgeColor(stock.market)}`}
            >
              {stock.market}
            </span>
          )}
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
              <p className="font-medium">
                {stock.price != null
                  ? formatLocalPrice(stock.ticker, stock.price)
                  : "N/A"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Rev Growth</span>
              <p
                className={`font-medium ${(stock.revGrowth || 0) > 0 ? "text-emerald-600" : "text-gray-600"}`}
              >
                {stock.revGrowth
                  ? `${(stock.revGrowth * 100).toFixed(0)}%`
                  : "N/A"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Gross Margin</span>
              <p className="font-medium">
                {stock.grossMargin
                  ? `${(stock.grossMargin * 100).toFixed(0)}%`
                  : "N/A"}
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
                <p
                  className={`font-medium ${(stock.rvolWeekly || 0) >= 1.5 ? "text-emerald-600" : "text-gray-600"}`}
                >
                  {formatNumber(stock.rvolWeekly, 2)}x
                </p>
              </div>
              <div>
                <span className="text-gray-500">R/R (W)</span>
                <p
                  className={`font-medium ${(stock.rrWeekly || 0) >= 2 ? "text-emerald-600" : "text-gray-600"}`}
                >
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
              <CompositeScoreBar
                score={stock.fundamentalScore ?? 0}
                label="Fundamentals"
              />
              <CompositeScoreBar
                score={stock.technicalScore ?? 0}
                label="Technical"
              />
              <CompositeScoreBar
                score={stock.momentumScore ?? 0}
                label="Momentum"
              />
            </div>
          )}

          {/* Multi-mode scores - always visible on expand */}
          {(stock.quantScore !== undefined ||
            stock.valueScore !== undefined ||
            stock.growthScore !== undefined) && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-700">
                Multi-Mode Scores
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div
                  className={`p-2 rounded border ${(stock.quantScore ?? 0) >= 70 ? "bg-emerald-50 border-emerald-200" : (stock.quantScore ?? 0) >= 50 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}
                >
                  <div className="text-lg font-bold">
                    {stock.quantScore ?? "-"}
                  </div>
                  <div className="text-[10px] text-gray-500">Quant</div>
                </div>
                <div
                  className={`p-2 rounded border ${(stock.valueScore ?? 0) >= 70 ? "bg-emerald-50 border-emerald-200" : (stock.valueScore ?? 0) >= 50 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}
                >
                  <div className="text-lg font-bold">
                    {stock.valueScore ?? "-"}
                  </div>
                  <div className="text-[10px] text-gray-500">Value</div>
                </div>
                <div
                  className={`p-2 rounded border ${(stock.growthScore ?? 0) >= 70 ? "bg-emerald-50 border-emerald-200" : (stock.growthScore ?? 0) >= 50 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}
                >
                  <div className="text-lg font-bold">
                    {stock.growthScore ?? "-"}
                  </div>
                  <div className="text-[10px] text-gray-500">Growth</div>
                </div>
              </div>
            </div>
          )}

          {/* Score breakdown - 3 categories only */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-gray-700">
              Legacy Score Breakdown
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ScoreBar
                score={stock.growth.score}
                max={50}
                label="Growth"
                color="bg-emerald-500"
              />
              <ScoreBar
                score={stock.financial.score}
                max={30}
                label="Financial"
                color="bg-blue-500"
              />
              <ScoreBar
                score={stock.technical.score}
                max={20}
                label="Technical"
                color="bg-violet-500"
              />
            </div>
          </div>

          {/* Score details - 3 categories */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Growth:</span>
              <p className="text-gray-700">
                {stock.growth.details.join(", ") || "N/A"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Financial:</span>
              <p className="text-gray-700">
                {stock.financial.details.join(", ") || "N/A"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Technical:</span>
              <p className="text-gray-700">
                {stock.technical.details.join(", ") || "N/A"}
              </p>
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
  const [scoringMode, setScoringMode] = useState<ScoringMode>("combined");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  const hasEnhancedData = scan.results.some(
    (r) => r.compositeScore !== undefined,
  );
  const hasMultiModeData = scan.results.some(
    (r) => r.combinedScore !== undefined,
  );

  // Get score based on selected mode
  const getScoreForMode = (stock: ScanResult, mode: ScoringMode): number => {
    switch (mode) {
      case "combined":
        return stock.combinedScore ?? stock.compositeScore ?? stock.totalScore;
      case "quant":
        return stock.quantScore ?? stock.combinedScore ?? stock.totalScore;
      case "value":
        return stock.valueScore ?? stock.combinedScore ?? stock.totalScore;
      case "growth":
        return stock.growthScore ?? stock.combinedScore ?? stock.totalScore;
      default:
        return stock.combinedScore ?? stock.compositeScore ?? stock.totalScore;
    }
  };

  const getDisplayScore = (stock: ScanResult) =>
    getScoreForMode(stock, scoringMode);

  const filteredResults = scan.results.filter((stock) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !stock.ticker.toLowerCase().includes(q) &&
        !stock.name.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    // Tier filter (use display score for enhanced data)
    const score = getDisplayScore(stock);
    if (tierFilter === "high" && score < 70) return false;
    if (tierFilter === "speculative" && (score < 50 || score >= 70))
      return false;
    if (tierFilter === "watchlist" && (score < 35 || score >= 50)) return false;
    // Risk filter
    if (riskFilter !== "all" && stock.riskTier !== riskFilter) return false;
    // Market filter
    if (marketFilter !== "all" && stock.market !== marketFilter) return false;
    return true;
  });

  // Sort by selected mode's score (descending)
  const sortedResults = [...filteredResults].sort((a, b) => {
    return getScoreForMode(b, scoringMode) - getScoreForMode(a, scoringMode);
  });

  const hasActiveFilters =
    tierFilter !== "all" || riskFilter !== "all" || marketFilter !== "all";
  const activeFilterCount = [
    tierFilter !== "all",
    riskFilter !== "all",
    marketFilter !== "all",
  ].filter(Boolean).length;
  const isFiltered = searchQuery !== "" || hasActiveFilters;

  const clearAllFilters = () => {
    setSearchQuery("");
    setTierFilter("all");
    setRiskFilter("all");
    setMarketFilter("all");
  };

  const toggleRow = (ticker: string) => {
    const next = new Set(expandedRows);
    if (next.has(ticker)) {
      next.delete(ticker);
    } else {
      next.add(ticker);
    }
    setExpandedRows(next);
  };

  const usCount =
    scan.summary?.usCount ??
    scan.results.filter((r) => r.market === "US").length;
  const sgxCount =
    scan.summary?.sgxCount ??
    scan.results.filter((r) => r.market === "SGX").length;
  const hkCount =
    scan.summary?.hkCount ??
    scan.results.filter((r) => r.market === "HK").length;
  const jpCount =
    scan.summary?.jpCount ??
    scan.results.filter((r) => r.market === "JP").length;
  const lseCount =
    scan.summary?.lseCount ??
    scan.results.filter((r) => r.market === "LSE").length;

  return (
    <div className="space-y-3">
      {/* Row 1: Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder={`Search ${scan.results.length} tickers or names...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
      </div>

      {/* Row 2: Scoring mode segmented control + filters */}
      <div className="flex items-center gap-2">
        {hasMultiModeData && (
          <div className="flex items-center gap-0.5 bg-gray-100 p-1 rounded-lg">
            {SCORING_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => setScoringMode(mode.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  scoringMode === mode.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}

        {/* Mobile: collapsible filter button */}
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`sm:hidden flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            hasActiveFilters
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-600 text-white rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Desktop: inline filter dropdowns */}
        <div className="hidden sm:flex items-center gap-2">
          <Select
            value={marketFilter}
            onChange={(val) => setMarketFilter(val as MarketFilter)}
            className="min-w-[120px]"
            triggerClassName={
              marketFilter !== "all" ? "!border-emerald-500 !bg-emerald-50" : ""
            }
            options={[
              { value: "all", label: "All Markets" },
              { value: "US", label: "US" },
              { value: "SGX", label: "SGX" },
              { value: "HK", label: "HK" },
              { value: "JP", label: "Japan" },
              { value: "CN", label: "China" },
              { value: "LSE", label: "LSE" },
            ]}
          />
          <Select
            value={tierFilter}
            onChange={(val) => setTierFilter(val as TierFilter)}
            className="min-w-[120px]"
            triggerClassName={
              tierFilter !== "all" ? "!border-emerald-500 !bg-emerald-50" : ""
            }
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
            className="min-w-[120px]"
            triggerClassName={
              riskFilter !== "all" ? "!border-emerald-500 !bg-emerald-50" : ""
            }
            options={[
              { value: "all", label: "All Risks" },
              { value: "TIER 1", label: "Tier 1 (Low)" },
              { value: "TIER 2", label: "Tier 2 (Med)" },
              { value: "TIER 3", label: "Tier 3 (High)" },
            ]}
          />
        </div>

        {/* Desktop: result count + clear (only when filtered) */}
        {isFiltered && (
          <div className="hidden sm:flex items-center gap-2 ml-auto text-xs text-gray-500">
            <span>
              Showing{" "}
              <span className="font-medium text-gray-700">
                {sortedResults.length}
              </span>{" "}
              of{" "}
              <span className="font-medium text-gray-700">
                {scan.results.length}
              </span>
            </span>
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-0.5 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={12} />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Mobile: expandable filter panel */}
      {filtersOpen && (
        <div className="sm:hidden flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <Select
            value={marketFilter}
            onChange={(val) => setMarketFilter(val as MarketFilter)}
            triggerClassName={
              marketFilter !== "all" ? "!border-emerald-500 !bg-emerald-50" : ""
            }
            options={[
              { value: "all", label: "All Markets" },
              { value: "US", label: "US" },
              { value: "SGX", label: "SGX" },
              { value: "HK", label: "HK" },
              { value: "JP", label: "Japan" },
              { value: "CN", label: "China" },
              { value: "LSE", label: "LSE" },
            ]}
          />
          <Select
            value={tierFilter}
            onChange={(val) => setTierFilter(val as TierFilter)}
            triggerClassName={
              tierFilter !== "all" ? "!border-emerald-500 !bg-emerald-50" : ""
            }
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
            triggerClassName={
              riskFilter !== "all" ? "!border-emerald-500 !bg-emerald-50" : ""
            }
            options={[
              { value: "all", label: "All Risks" },
              { value: "TIER 1", label: "Tier 1 (Low)" },
              { value: "TIER 2", label: "Tier 2 (Med)" },
              { value: "TIER 3", label: "Tier 3 (High)" },
            ]}
          />
          {isFiltered && (
            <div className="flex items-center justify-between pt-1 border-t border-gray-200">
              <span className="text-xs text-gray-500">
                Showing{" "}
                <span className="font-medium text-gray-700">
                  {sortedResults.length}
                </span>{" "}
                of{" "}
                <span className="font-medium text-gray-700">
                  {scan.results.length}
                </span>
              </span>
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={12} />
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header - with horizontal scroll wrapper */}
        <div className="overflow-x-auto">
          <div className="sm:min-w-[800px]">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
              <span className="w-6" /> {/* Expand button */}
              <span className="w-8 text-right">#</span>
              <span className="w-16">Ticker</span>
              <span className="w-32 sm:flex-1 min-w-0">Name</span>
              <span
                className="w-12 text-right"
                title={`Sorted by ${SCORING_MODES.find((m) => m.value === scoringMode)?.label || "Combined"}`}
              >
                {scoringMode === "combined"
                  ? "Score"
                  : scoringMode.charAt(0).toUpperCase() + scoringMode.slice(1)}
              </span>
              {/* Q/V/G headers - hidden on mobile */}
              <div className="hidden md:flex items-center gap-1.5">
                <span className="w-8 text-center" title="Quant Score">
                  Q
                </span>
                <span className="w-8 text-center" title="Value Score">
                  V
                </span>
                <span className="w-8 text-center" title="Growth Score">
                  G
                </span>
              </div>
              <span className="w-16">Tier</span>
              <span className="w-10 hidden sm:block">Mkt</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-100">
              {sortedResults.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                  No stocks match your filters
                </div>
              ) : (
                sortedResults.map((stock, idx) => {
                  const stockKey = `${stock.ticker}-${stock.market}`;
                  return (
                    <StockRow
                      key={stockKey}
                      stock={stock}
                      isExpanded={expandedRows.has(stockKey)}
                      onToggle={() => toggleRow(stockKey)}
                      displayScore={getScoreForMode(stock, scoringMode)}
                      displayRank={idx + 1}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
