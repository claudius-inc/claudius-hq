"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Search, Filter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ScanResult {
  rank: number;
  ticker: string;
  name: string;
  price: number | null;
  mcapB: string;
  totalScore: number;
  tier: string;
  tierColor: string;
  riskTier: string;
  growth: { score: number; max: number; details: string[] };
  financial: { score: number; max: number; details: string[] };
  insider: { score: number; max: number; details: string[] };
  technical: { score: number; max: number; details: string[] };
  analyst: { score: number; max: number; details: string[] };
  risk: { penalty: number; flags: string[] };
  revGrowth: number | null;
  grossMargin: number | null;
}

interface ScanSummary {
  universeSize: number;
  scannedCount: number;
  highConviction: number;
  speculative: number;
  watchlist: number;
  avoid: number;
}

interface ParsedScan {
  id: number;
  scanType: string;
  scannedAt: string | null;
  stockCount: number | null;
  results: ScanResult[];
  summary: ScanSummary | null;
}

interface Props {
  structuralInflection: ParsedScan | null;
  sunTzuSgx: ParsedScan | null;
}

type TierFilter = "all" | "high" | "speculative" | "watchlist";
type RiskFilter = "all" | "TIER 1" | "TIER 2" | "TIER 3";

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

function StockRow({ stock, isExpanded, onToggle }: { 
  stock: ScanResult; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
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
        
        <span className="w-16 font-mono font-medium text-gray-900">{stock.ticker}</span>
        
        <span className="flex-1 truncate text-sm text-gray-600 hidden sm:block">
          {stock.name}
        </span>
        
        <span className={`w-12 text-right font-semibold ${getScoreColor(stock.totalScore)}`}>
          {stock.totalScore}
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
          
          {/* Scoring breakdown */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-gray-700">Scoring Breakdown</h4>
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

function ScannerTab({ scan, title }: { scan: ParsedScan | null; title: string }) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
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

  const filteredResults = scan.results.filter((stock) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!stock.ticker.toLowerCase().includes(q) && !stock.name.toLowerCase().includes(q)) {
        return false;
      }
    }
    // Tier filter
    if (tierFilter === "high" && stock.totalScore < 70) return false;
    if (tierFilter === "speculative" && (stock.totalScore < 50 || stock.totalScore >= 70)) return false;
    if (tierFilter === "watchlist" && (stock.totalScore < 35 || stock.totalScore >= 50)) return false;
    // Risk filter
    if (riskFilter !== "all" && stock.riskTier !== riskFilter) return false;
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

  return (
    <div className="space-y-4">
      {/* Scan info & summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-4">
          {scannedAt && (
            <span className="text-gray-500">
              Last scanned:{" "}
              <span className="font-medium text-gray-700">
                {formatDistanceToNow(scannedAt, { addSuffix: true })}
              </span>
            </span>
          )}
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">
            {scan.results.length} stocks scanned
          </span>
        </div>
        
        {scan.summary && (
          <div className="flex gap-3 text-xs">
            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded">
              🔥 {scan.summary.highConviction}
            </span>
            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded">
              ⚡ {scan.summary.speculative}
            </span>
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
              👀 {scan.summary.watchlist}
            </span>
          </div>
        )}
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
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as TierFilter)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">All Tiers</option>
            <option value="high">🔥 High Conviction</option>
            <option value="speculative">⚡ Speculative</option>
            <option value="watchlist">👀 Watchlist</option>
          </select>
          
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">All Risks</option>
            <option value="TIER 1">Tier 1 (Low)</option>
            <option value="TIER 2">Tier 2 (Med)</option>
            <option value="TIER 3">Tier 3 (High)</option>
          </select>
        </div>
      </div>

      {/* Results table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
          <span className="w-6" /> {/* Expand button */}
          <span className="w-8 text-right">#</span>
          <span className="w-16">Ticker</span>
          <span className="flex-1 hidden sm:block">Name</span>
          <span className="w-12 text-right">Score</span>
          <span className="w-20">Tier</span>
          <span className="w-14 hidden sm:block">Risk</span>
          <span className="w-20 text-right hidden md:block">Price</span>
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
  );
}

export function ScannerResults({ structuralInflection, sunTzuSgx }: Props) {
  const [activeTab, setActiveTab] = useState<"structural" | "sunTzu">("structural");

  return (
    <div className="space-y-4">
      {/* Tab selector */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("structural")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "structural"
              ? "border-emerald-500 text-emerald-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          🚀 Structural Inflection
        </button>
        <button
          onClick={() => setActiveTab("sunTzu")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "sunTzu"
              ? "border-emerald-500 text-emerald-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          📜 Sun Tzu SGX
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "structural" && (
        <ScannerTab scan={structuralInflection} title="Structural Inflection Scanner" />
      )}
      {activeTab === "sunTzu" && (
        <ScannerTab scan={sunTzuSgx} title="Sun Tzu SGX Scanner" />
      )}
    </div>
  );
}
