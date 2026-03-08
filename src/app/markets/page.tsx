"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Skeleton } from "@/components/Skeleton";
import { PageHero } from "@/components/PageHero";
import { Spinner } from "@/components/ui/Spinner";
import { MACRO_INDICATORS } from "@/lib/macro-indicators";
import { formatDate, formatTimestamp } from "@/lib/format-date";
import {
  Globe,
  FileText,
  FlaskConical,
  TrendingUp,
  Flame,
  HardHat,
  Factory,
  CreditCard,
  Activity,
  Landmark,
  ArrowRight,
  HelpCircle,
  ChevronRight,
  Drama,
  ArrowLeftRight,
  BarChart3,
  Gauge,
  Users,
  Briefcase,
} from "lucide-react";
import { HealthDot, labelToHealthLevel, type HealthLevel } from "@/components/HealthDot";
import { RangePopover } from "@/components/ui/RangePopover";

// ── Types ────────────────────────────────────────────

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
  unit: string;
  description: string;
  whyItMatters: string;
  ranges: Array<{ label: string; min: number | null; max: number | null; meaning: string; marketImpact: string }>;
  keyLevels?: Array<{ level: number; significance: string }>;
  affectedAssets: string[];
  data: { current: number; min: number; max: number; avg: number } | null;
  interpretation: { label: string; meaning: string; marketImpact: string } | null;
  percentile: number | null;
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
  description: string;
  whyItMatters: string;
  ranges: Array<{ label: string; min: number | null; max: number | null; meaning: string; color: string }>;
  affectedAssets: string[];
  data: {
    price: number;
    change: number;
    changePercent: number;
    previousClose: number;
    fiftyTwoWeekLow: number;
    fiftyTwoWeekHigh: number;
    fiftyDayAvg: number;
    twoHundredDayAvg: number;
    rangePosition: number;
  } | null;
  interpretation: { label: string; meaning: string; color: string } | null;
}

interface RegimeData {
  name: string;
  description: string;
  color: string;
  indicators: {
    realYield: number | null;
    debtToGdp: number | null;
    deficitToGdp: number | null;
    dxy: number | null;
  };
  implications: string[];
}

interface SentimentData {
  vix: {
    value: number | null;
    change: number | null;
    changePercent: number | null;
    level: "low" | "moderate" | "elevated" | "fear" | null;
  };
  putCall: {
    value: number | null;
    level: "greedy" | "neutral" | "fearful" | null;
    source: string;
  };
  volatilityContext?: {
    termStructure: number;
    contango: string;
    interpretation: string;
  } | null;
}

interface BreadthData {
  advanceDecline: {
    advances: number | null;
    declines: number | null;
    unchanged: number | null;
    ratio: number | null;
    netAdvances: number | null;
  };
  newHighsLows: {
    newHighs: number | null;
    newLows: number | null;
    ratio: number | null;
    netHighs: number | null;
  };
  level: "bullish" | "neutral" | "bearish";
  interpretation: string;
  mcclellan?: { oscillator: number | null; signal: string | null };
}

interface CongressData {
  buyCount: number;
  sellCount: number;
  ratio: number;
  level: "bullish" | "neutral" | "bearish";
  totalTrades: number;
  topTickers: Array<{ ticker: string; count: number }>;
  recentTrades: Array<{
    date: string;
    member: string;
    party: string;
    state: string;
    chamber: string;
    ticker: string;
    type: string;
    amount: string;
  }>;
}

interface InsiderData {
  buyCount: number;
  sellCount: number;
  buyValue: number;
  sellValue: number;
  ratio: number;
  valueRatio: number;
  level: "bullish" | "neutral" | "bearish";
  totalTrades: number;
  clusterBuys: Array<{ ticker: string; buys: number; buyValue: number }>;
  recentTrades: Array<{
    date: string;
    company: string;
    ticker: string;
    insider: string;
    title: string;
    type: string;
    shares: number;
    price: number;
    value: number;
  }>;
}

interface InsightsData {
  insights: string | null;
  generatedAt: string | null;
  indicatorSnapshot: unknown;
}

interface YieldSpread {
  name: string;
  value: number | null;
  interpretation: string;
  color: "green" | "amber" | "gray";
}

// ── Helpers ──────────────────────────────────────────

function ConditionalLink({ href, children, ...props }: { href?: string; children: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent) => void }) {
  if (href) return <Link href={href} {...props}>{children}</Link>;
  return <div {...props}>{children}</div>;
}

function getStatusColor(label: string): string {
  const colors: Record<string, string> = {
    "Target Zone": "bg-emerald-100 text-emerald-700",
    "At Target": "bg-emerald-100 text-emerald-700",
    Healthy: "bg-emerald-100 text-emerald-700",
    Normal: "bg-emerald-100 text-emerald-700",
    "Full Employment": "bg-emerald-100 text-emerald-700",
    Expansion: "bg-emerald-100 text-emerald-700",
    Balanced: "bg-emerald-100 text-emerald-700",
    Steep: "bg-emerald-100 text-emerald-700",
    Sustainable: "bg-emerald-100 text-emerald-700",
    Surplus: "bg-emerald-100 text-emerald-700",
    "Strong Growth": "bg-emerald-100 text-emerald-700",
    "Attractive Carry": "bg-emerald-100 text-emerald-700",
    "Moderate Growth": "bg-emerald-100 text-emerald-700",
    Accommodative: "bg-blue-100 text-blue-700",
    Normalizing: "bg-blue-100 text-blue-700",
    Neutral: "bg-gray-100 text-gray-700",
    Moderate: "bg-gray-100 text-gray-700",
    "Moderate Strength": "bg-gray-100 text-gray-700",
    Low: "bg-blue-100 text-blue-700",
    "Below Target": "bg-blue-100 text-blue-700",
    "Extremely Low": "bg-blue-100 text-blue-700",
    "Very Low": "bg-blue-100 text-blue-700",
    Flat: "bg-amber-100 text-amber-700",
    "Above Target": "bg-amber-100 text-amber-700",
    Elevated: "bg-amber-100 text-amber-700",
    Softening: "bg-amber-100 text-amber-700",
    Restrictive: "bg-amber-100 text-amber-700",
    Inverted: "bg-amber-100 text-amber-700",
    Contraction: "bg-amber-100 text-amber-700",
    Concerning: "bg-amber-100 text-amber-700",
    Weakness: "bg-amber-100 text-amber-700",
    "Moderate Deficit": "bg-amber-100 text-amber-700",
    "Large Deficit": "bg-amber-100 text-amber-700",
    Overheating: "bg-amber-100 text-amber-700",
    Unattractive: "bg-amber-100 text-amber-700",
    "Very Tight": "bg-amber-100 text-amber-700",
    High: "bg-red-100 text-red-700",
    "Very Restrictive": "bg-red-100 text-red-700",
    "Deeply Inverted": "bg-red-100 text-red-700",
    "Deep Contraction": "bg-red-100 text-red-700",
    Crisis: "bg-red-100 text-red-700",
    Recession: "bg-red-100 text-red-700",
    Stressed: "bg-red-100 text-red-700",
    Extreme: "bg-red-100 text-red-700",
    "Crisis Deficit": "bg-red-100 text-red-700",
    "Crisis/ZIRP": "bg-purple-100 text-purple-700",
    "Deflation Risk": "bg-purple-100 text-purple-700",
    // FX-specific
    "Yen Strength": "bg-blue-100 text-blue-700",
    "Yen Weakness": "bg-amber-100 text-amber-700",
    "Extreme Weakness": "bg-red-100 text-red-700",
    "Dollar Strength": "bg-amber-100 text-amber-700",
    "Euro Strength": "bg-blue-100 text-blue-700",
    "Extreme Euro Strength": "bg-amber-100 text-amber-700",
    "Weak Dollar": "bg-emerald-100 text-emerald-700",
    "Strong Dollar": "bg-amber-100 text-amber-700",
    "Very Strong Dollar": "bg-red-100 text-red-700",
    // Foreign yields
    "YCC Zone": "bg-blue-100 text-blue-700",
    Transition: "bg-amber-100 text-amber-700",
    Normalization: "bg-amber-100 text-amber-700",
    "Negative/ZIRP": "bg-purple-100 text-purple-700",
  };
  return colors[label] || "bg-gray-100 text-gray-700";
}

function getTrendArrow(current: number, avg: number): { arrow: string; color: string } {
  const pctChange = ((current - avg) / avg) * 100;
  if (pctChange > 2) return { arrow: "\u2191", color: "text-emerald-600" };
  if (pctChange < -2) return { arrow: "\u2193", color: "text-red-600" };
  return { arrow: "\u2192", color: "text-gray-500" };
}

function formatSentimentLevel(level: string | null | undefined): string {
  if (!level) return "\u2014";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function formatIndicatorVal(indicator: MacroIndicator): string {
  if (!indicator.data) return "\u2014";
  const v = indicator.data.current;
  const num = typeof v === "number"
    ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : String(v);
  if (indicator.unit === "%" || indicator.unit === "% YoY") return num + "%";
  if (indicator.unit === "bps") return num + " bps";
  if (indicator.unit === "thousands") return num + "K";
  return num;
}

function etfColorToHealthLevel(color: string | null | undefined): HealthLevel {
  if (!color) return "neutral";
  if (color === "green" || color === "blue") return "healthy";
  if (color === "amber") return "caution";
  if (color === "red") return "warning";
  return "neutral";
}

// Sentiment indicator ranges for Market Pulse popovers
const vixRanges = [
  { label: "Low", min: null, max: 15, meaning: "Complacency, low fear", marketImpact: "Bullish but watch for reversal" },
  { label: "Moderate", min: 15, max: 20, meaning: "Normal market conditions", marketImpact: "Healthy risk appetite" },
  { label: "Elevated", min: 20, max: 30, meaning: "Rising uncertainty", marketImpact: "Increased hedging activity" },
  { label: "Fear", min: 30, max: null, meaning: "Panic or crisis conditions", marketImpact: "Potential capitulation/buying opportunity" },
];

const putCallRanges = [
  { label: "Greedy", min: null, max: 0.7, meaning: "More calls than puts, bullish bets", marketImpact: "Contrarian bearish signal" },
  { label: "Neutral", min: 0.7, max: 1.0, meaning: "Balanced options activity", marketImpact: "No strong directional bias" },
  { label: "Fearful", min: 1.0, max: null, meaning: "More puts than calls, hedging", marketImpact: "Contrarian bullish signal" },
];

const breadthRanges = [
  { label: "Bearish", min: null, max: 0.7, meaning: "More declines than advances", marketImpact: "Broad-based selling pressure" },
  { label: "Neutral", min: 0.7, max: 1.3, meaning: "Balanced market participation", marketImpact: "No strong breadth signal" },
  { label: "Bullish", min: 1.3, max: null, meaning: "More advances than declines", marketImpact: "Broad-based buying, healthy rally" },
];

const realYieldRanges = [
  { label: "Deeply Negative", min: null, max: -1, meaning: "Severe financial repression, savers punished", marketImpact: "Gold & real assets outperform" },
  { label: "Negative", min: -1, max: 0, meaning: "Accommodative real rates, mild repression", marketImpact: "Risk assets favored, dollar weakens" },
  { label: "Low Positive", min: 0, max: 1, meaning: "Neutral real rate environment", marketImpact: "Balanced conditions for most assets" },
  { label: "Moderate", min: 1, max: 2, meaning: "Positive real returns on safe assets", marketImpact: "Cash & bonds competitive, growth headwinds" },
  { label: "Restrictive", min: 2, max: null, meaning: "Tight policy, high hurdle rate", marketImpact: "Headwind for equities & gold, bonds attractive" },
];

const debtToGdpRanges = [
  { label: "Low", min: null, max: 60, meaning: "Healthy fiscal position, room for spending", marketImpact: "Strong sovereign credit, low risk premium" },
  { label: "Moderate", min: 60, max: 90, meaning: "Manageable debt, some constraints", marketImpact: "Normal market conditions" },
  { label: "Elevated", min: 90, max: 120, meaning: "High debt burden, sustainability concerns", marketImpact: "Rising risk premium on treasuries" },
  { label: "Critical", min: 120, max: null, meaning: "Fiscal dominance zone, debt constrains policy", marketImpact: "Currency debasement risk, hard assets favored" },
];

const deficitToGdpRanges = [
  { label: "Surplus", min: null, max: 0, meaning: "Government running a budget surplus", marketImpact: "Fiscal tightening, lower bond supply" },
  { label: "Low", min: 0, max: 3, meaning: "Sustainable deficit level", marketImpact: "Manageable treasury issuance" },
  { label: "Elevated", min: 3, max: 6, meaning: "Above-normal deficit, expansionary fiscal", marketImpact: "Increased bond supply, rising yields" },
  { label: "High", min: 6, max: null, meaning: "Unsustainable deficit, funding pressure", marketImpact: "Bond vigilante risk, monetization pressure" },
];

// Regime detection logic
function detectRegime(realYield: number | null, debtToGdp: number | null): RegimeData {
  if (realYield !== null && realYield < 0 && debtToGdp !== null && debtToGdp > 100) {
    return {
      name: "Financial Repression",
      description: "Negative real rates inflating away debt",
      color: "bg-amber-100 border-amber-300 text-amber-800",
      indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
      implications: ["Gold outperforms", "Bonds lose purchasing power", "Real assets favored"],
    };
  }
  if (debtToGdp !== null && debtToGdp > 120) {
    return {
      name: "Fiscal Dominance",
      description: "Debt levels constraining monetary policy",
      color: "bg-red-100 border-red-300 text-red-800",
      indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
      implications: ["Currency debasement risk", "Hard assets critical", "Bond vigilantes watching"],
    };
  }
  if (realYield !== null && realYield > 2) {
    return {
      name: "Restrictive Policy",
      description: "Real rates positive, liquidity tightening",
      color: "bg-blue-100 border-blue-300 text-blue-800",
      indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
      implications: ["Bonds may outperform", "Gold faces headwinds", "Cash competitive"],
    };
  }
  return {
    name: "Transitional",
    description: "Mixed signals, regime unclear",
    color: "bg-gray-100 border-gray-300 text-gray-700",
    indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
    implications: ["Diversification key", "Watch for regime signals"],
  };
}

const categoryLabels: Record<string, string> = {
  rates: "Interest Rates",
  inflation: "Inflation",
  employment: "Employment",
  growth: "Economic Growth",
  credit: "Credit Markets",
  fx: "FX Rates",
  "foreign-yields": "Foreign Yields",
};

const categoryIcons: Record<string, React.ReactNode> = {
  rates: <TrendingUp className="w-4 h-4" />,
  inflation: <Flame className="w-4 h-4" />,
  employment: <HardHat className="w-4 h-4" />,
  growth: <Factory className="w-4 h-4" />,
  credit: <CreditCard className="w-4 h-4" />,
  fx: <ArrowLeftRight className="w-4 h-4" />,
  "foreign-yields": <Globe className="w-4 h-4" />,
};

const categoryOrder = ["rates", "inflation", "employment", "growth", "credit", "fx", "foreign-yields"];

// ── Indicator Details (expanded panel) ───────────────

function IndicatorDetails({ indicator }: { indicator: MacroIndicator }) {
  return (
    <div className="space-y-3">
      {indicator.interpretation && (
        <div className="bg-blue-50 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
          <p className="text-sm text-gray-700 mb-1"><strong>Status:</strong> {indicator.interpretation.meaning}</p>
          <p className="text-sm text-gray-700"><strong>Market Impact:</strong> {indicator.interpretation.marketImpact}</p>
        </div>
      )}
      <div className="bg-gray-50 rounded-lg p-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
        <p className="text-sm text-gray-700">{indicator.whyItMatters}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Interpretation Guide</h4>
        <div className="space-y-1">
          {indicator.ranges.map((range, idx) => (
            <div
              key={idx}
              className={`flex flex-wrap items-start gap-1 sm:gap-2 text-xs p-1.5 rounded ${
                indicator.interpretation?.label === range.label
                  ? getStatusColor(range.label) + " ring-1 ring-offset-1 ring-gray-300"
                  : "bg-gray-50"
              }`}
            >
              <span className="font-medium w-28 shrink-0">{range.label}</span>
              <span className="text-gray-500 w-20 shrink-0 tabular-nums">
                {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? range.max : "+"}
              </span>
              <span className="text-gray-600 flex-1">{range.meaning}</span>
            </div>
          ))}
        </div>
      </div>
      {indicator.keyLevels && indicator.keyLevels.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Key Levels</h4>
          <div className="flex flex-wrap gap-2">
            {indicator.keyLevels.map((kl, idx) => (
              <div key={idx} className="bg-gray-100 rounded px-2.5 py-1 text-xs">
                <span className="font-mono font-semibold">{kl.level}</span>
                <span className="text-gray-500 ml-1.5">{kl.significance}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
        <div className="flex flex-wrap gap-1">
          {indicator.affectedAssets.map((asset, idx) => (
            <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{asset}</span>
          ))}
        </div>
      </div>
      {indicator.data && (
        <div className="flex items-center gap-4 text-xs text-gray-400 pt-2 border-t border-gray-100">
          <span>5yr Range: {indicator.data.min.toFixed(1)} &ndash; {indicator.data.max.toFixed(1)}</span>
          <span>Avg: {indicator.data.avg.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

// ── Dashboard Card ───────────────────────────────────

function DashboardCard({
  title,
  icon,
  children,
  href,
  loading,
  loadingSkeleton,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  href?: string;
  loading?: boolean;
  loadingSkeleton?: React.ReactNode;
}) {
  const defaultSkeleton = (
    <div className="space-y-3">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );

  const content = (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          <span className="flex items-center">{icon}</span>
          {title}
        </h2>
        {href && (
          <span className="text-xs text-gray-400 hover:text-gray-600">
            View all &rarr;
          </span>
        )}
      </div>
      {loading ? (loadingSkeleton || defaultSkeleton) : children}
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

function QuickResearchForm({ compact = false }: { compact?: boolean }) {
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
          placeholder={compact ? "Ticker" : "Enter ticker (e.g., AAPL)"}
          autoCapitalize="characters"
          autoComplete="off"
          className={`${compact ? "w-24" : "flex-1 min-w-0"} px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none`}
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
      {message && !compact && (
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
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(null);
  const [marketEtfs, setMarketEtfs] = useState<MarketEtf[]>([]);
  const [regimeData, setRegimeData] = useState<RegimeData | null>(null);
  const [breadthData, setBreadthData] = useState<BreadthData | null>(null);
  const [congressData, setCongressData] = useState<CongressData | null>(null);
  const [insiderData, setInsiderData] = useState<InsiderData | null>(null);
  const [yieldSpreads, setYieldSpreads] = useState<YieldSpread[]>([]);
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState({
    portfolio: true,
    macro: true,
    reports: true,
    sentiment: true,
    etfs: true,
    regime: true,
    breadth: true,
    congress: true,
    insider: true,
    insights: true,
  });

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const regenerateInsights = async () => {
    setGenerating(true);
    setInsightsError(null);
    try {
      const res = await fetch("/api/macro/insights/generate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setInsightsData(data);
      } else {
        const error = await res.json();
        setInsightsError(error.error || "Failed to generate insights");
      }
    } catch (e) {
      console.error("Error generating insights:", e);
      setInsightsError("Failed to generate insights");
    } finally {
      setGenerating(false);
    }
  };

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
        setYieldSpreads(data.yieldSpreads || []);
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
        setSentimentData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, sentiment: false })));

    // Fetch breadth data
    fetch("/api/markets/breadth")
      .then((res) => res.json())
      .then((data) => {
        setBreadthData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, breadth: false })));

    // Fetch congress data
    fetch("/api/markets/congress")
      .then((res) => res.json())
      .then((data) => {
        setCongressData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, congress: false })));

    // Fetch insider data
    fetch("/api/markets/insider")
      .then((res) => res.json())
      .then((data) => {
        setInsiderData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, insider: false })));

    // Fetch AI insights
    fetch("/api/macro/insights")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) setInsightsData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, insights: false })));

    // Fetch regime data (from macro + gold endpoints)
    Promise.all([
      fetch("/api/macro").then(res => res.ok ? res.json() : null),
      fetch("/api/gold").then(res => res.ok ? res.json() : null),
    ])
      .then(([macroData, goldData]: [
        { indicators?: { id: string; data?: { current: number } }[] } | null,
        { realYields?: { value: number }; dxy?: { price: number } } | null
      ]) => {
        const indicators = macroData?.indicators || [];
        const findIndicator = (id: string) => {
          const ind = indicators.find((i) => i.id === id);
          return ind?.data?.current ?? null;
        };

        const realYield = goldData?.realYields?.value ?? null;
        const debtToGdp = findIndicator("debt-to-gdp");
        const deficitToGdp = findIndicator("deficit-to-gdp");
        const dxy = goldData?.dxy?.price ?? null;

        const regime = detectRegime(realYield, debtToGdp);
        regime.indicators = { realYield, debtToGdp, deficitToGdp: deficitToGdp ? Math.abs(deficitToGdp) : null, dxy };
        setRegimeData(regime);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, regime: false })));
  }, []);

  // Group indicators by category
  const grouped = macroIndicators.reduce((acc: Record<string, MacroIndicator[]>, ind) => {
    if (!acc[ind.category]) acc[ind.category] = [];
    acc[ind.category].push(ind);
    return acc;
  }, {});

  const etfColorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    gray: "bg-gray-100 text-gray-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    green: "bg-emerald-100 text-emerald-700",
  };

  return (
    <>
      <PageHero
        title="Markets Dashboard"
        subtitle="Portfolio overview, research, and market signals"
      />

      {/* Grid Layout - items-start for natural heights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Macro Signals */}
        <DashboardCard
          title="Macro Signals"
          icon={<Globe className="w-4 h-4" />}
        >
          <div className="space-y-4">
            {/* Regime + Market Pulse (merged) */}
            <div className="rounded-xl bg-gray-900 p-3 sm:p-4 space-y-3">
              {/* Regime strip */}
              <ConditionalLink
                href={!loading.regime && !loading.sentiment && regimeData ? "/markets/regime" : undefined}
                className="flex items-center justify-between gap-3 pb-3 border-b border-gray-700/50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {loading.sentiment || loading.regime ? (
                    <>
                      <Skeleton className="w-6 h-6 rounded-md !bg-gray-700" />
                      <div>
                        <Skeleton className="h-4 w-32 !bg-gray-700 mb-1" />
                        <Skeleton className="h-2.5 w-48 !bg-gray-800" />
                      </div>
                    </>
                  ) : regimeData ? (
                    <>
                      <div className={`p-1 rounded-md ${
                        regimeData.name === "Fiscal Dominance" ? "bg-red-500/20" :
                        regimeData.name === "Financial Repression" ? "bg-amber-500/20" :
                        regimeData.name === "Restrictive Policy" ? "bg-blue-500/20" :
                        "bg-gray-500/20"
                      }`}>
                        <Landmark className={`w-3.5 h-3.5 ${
                          regimeData.name === "Fiscal Dominance" ? "text-red-400" :
                          regimeData.name === "Financial Repression" ? "text-amber-400" :
                          regimeData.name === "Restrictive Policy" ? "text-blue-400" :
                          "text-gray-400"
                        }`} />
                      </div>
                      <div>
                        <span className={`text-sm font-bold ${
                          regimeData.name === "Fiscal Dominance" ? "text-red-400" :
                          regimeData.name === "Financial Repression" ? "text-amber-400" :
                          regimeData.name === "Restrictive Policy" ? "text-blue-400" :
                          "text-gray-300"
                        }`}>
                          {regimeData.name}
                        </span>
                        <p className="text-[10px] text-gray-500 leading-tight">{regimeData.description}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-1 rounded-md bg-gray-500/20">
                        <Landmark className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-gray-500">{"\u00A0"}</span>
                        <p className="text-[10px] text-gray-500 leading-tight">{"\u00A0"}</p>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {loading.sentiment || loading.regime ? (
                    <>
                      <Skeleton className="h-3 w-14 !bg-gray-700" />
                      <Skeleton className="h-3 w-14 !bg-gray-700 hidden sm:block" />
                      <Skeleton className="h-3 w-14 !bg-gray-700 hidden sm:block" />
                    </>
                  ) : regimeData ? (
                    <>
                      {regimeData.indicators.realYield !== null && (
                        <RangePopover ranges={realYieldRanges} currentLabel={
                          regimeData.indicators.realYield < -1 ? "Deeply Negative" :
                          regimeData.indicators.realYield < 0 ? "Negative" :
                          regimeData.indicators.realYield < 1 ? "Low Positive" :
                          regimeData.indicators.realYield < 2 ? "Moderate" : "Restrictive"
                        } unit="%">
                          <div className="text-center cursor-pointer hover:opacity-80 transition-opacity text-[10px] text-gray-400">
                            <span className="opacity-60">RY </span>
                            <span className="font-bold text-gray-300">{regimeData.indicators.realYield.toFixed(2)}%</span>
                            <HelpCircle className="w-2.5 h-2.5 text-gray-600 hover:text-gray-400 inline-block ml-0.5 -mt-0.5 transition-colors" />
                          </div>
                        </RangePopover>
                      )}
                      <span className="hidden sm:contents">
                        {regimeData.indicators.debtToGdp !== null && (
                          <RangePopover ranges={debtToGdpRanges} currentLabel={
                            regimeData.indicators.debtToGdp < 60 ? "Low" :
                            regimeData.indicators.debtToGdp < 90 ? "Moderate" :
                            regimeData.indicators.debtToGdp < 120 ? "Elevated" : "Critical"
                          } unit="%">
                            <div className="text-center cursor-pointer hover:opacity-80 transition-opacity text-[10px] text-gray-400">
                              <span className="opacity-60">D/G </span>
                              <span className="font-bold text-gray-300">{regimeData.indicators.debtToGdp.toFixed(0)}%</span>
                              <HelpCircle className="w-2.5 h-2.5 text-gray-600 hover:text-gray-400 inline-block ml-0.5 -mt-0.5 transition-colors" />
                            </div>
                          </RangePopover>
                        )}
                        {regimeData.indicators.deficitToGdp !== null && (
                          <RangePopover ranges={deficitToGdpRanges} currentLabel={
                            regimeData.indicators.deficitToGdp < 0 ? "Surplus" :
                            regimeData.indicators.deficitToGdp < 3 ? "Low" :
                            regimeData.indicators.deficitToGdp < 6 ? "Elevated" : "High"
                          } unit="%">
                            <div className="text-center cursor-pointer hover:opacity-80 transition-opacity text-[10px] text-gray-400">
                              <span className="opacity-60">Def </span>
                              <span className="font-bold text-gray-300">{regimeData.indicators.deficitToGdp.toFixed(1)}%</span>
                              <HelpCircle className="w-2.5 h-2.5 text-gray-600 hover:text-gray-400 inline-block ml-0.5 -mt-0.5 transition-colors" />
                            </div>
                          </RangePopover>
                        )}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-40" />
                    </>
                  ) : (
                    <span className="h-3 w-14">{"\u00A0"}</span>
                  )}
                </div>
              </ConditionalLink>

              {/* Market Pulse */}
              <div>
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  {loading.sentiment ? (
                    <>
                      <Skeleton className="w-3.5 h-3.5 rounded !bg-gray-700" />
                      <Skeleton className="h-2.5 w-20 !bg-gray-700" />
                    </>
                  ) : (
                    <>
                      <Activity className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-medium uppercase tracking-wider">
                        Market Pulse
                      </span>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 sm:gap-6">
                  {/* VIX */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                      {loading.sentiment ? (
                        <Skeleton className="h-3 w-8 !bg-gray-700" />
                      ) : (
                        <>
                          VIX
                          <RangePopover ranges={vixRanges} currentLabel={formatSentimentLevel(sentimentData?.vix.level)}>
                            <HelpCircle className="w-3 h-3 text-gray-500 hover:text-gray-300 transition-colors" />
                          </RangePopover>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {loading.sentiment ? (
                        <>
                          <Skeleton className="h-6 w-12 !bg-gray-700" />
                          <Skeleton className="h-4 w-16 rounded-full !bg-gray-700" />
                        </>
                      ) : (
                        <>
                          <span
                            className={`text-base sm:text-lg font-bold ${
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
                            {sentimentData?.vix.value?.toFixed(1) ?? "\u2014"}
                          </span>
                          <span
                            className={`text-xs ${sentimentData?.vix?.change != null && sentimentData.vix.change >= 0 ? "text-red-400" : "text-emerald-400"}`}
                          >
                            {sentimentData?.vix?.change != null && (
                              <>
                                {sentimentData.vix.change >= 0 ? "\u25B2" : "\u25BC"}
                                {Math.abs(sentimentData.vix.change).toFixed(1)}
                              </>
                            )}
                          </span>
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
                        </>
                      )}
                    </div>
                  </div>

                  {/* Put/Call */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                      {loading.sentiment ? (
                        <Skeleton className="h-3 w-8 !bg-gray-700" />
                      ) : (
                        <>
                          P/C
                          <RangePopover ranges={putCallRanges} currentLabel={formatSentimentLevel(sentimentData?.putCall.level)}>
                            <HelpCircle className="w-3 h-3 text-gray-500 hover:text-gray-300 transition-colors" />
                          </RangePopover>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {loading.sentiment ? (
                        <>
                          <Skeleton className="h-6 w-12 !bg-gray-700" />
                          <Skeleton className="h-4 w-16 rounded-full !bg-gray-700" />
                        </>
                      ) : (
                        <>
                          <span
                            className={`text-base sm:text-lg font-bold ${
                              sentimentData?.putCall.level === "greedy"
                                ? "text-amber-400"
                                : sentimentData?.putCall.level === "neutral"
                                  ? "text-emerald-400"
                                  : sentimentData?.putCall.level === "fearful"
                                    ? "text-red-400"
                                    : "text-gray-400"
                            }`}
                          >
                            {sentimentData?.putCall.value?.toFixed(2) ?? "\u2014"}
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
                        </>
                      )}
                    </div>
                  </div>

                  {/* Breadth */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                      {loading.sentiment ? (
                        <Skeleton className="h-3 w-8 !bg-gray-700" />
                      ) : (
                        <>
                          A/D
                          <RangePopover ranges={breadthRanges} currentLabel={breadthData?.level ? breadthData.level.charAt(0).toUpperCase() + breadthData.level.slice(1) : null}>
                            <HelpCircle className="w-3 h-3 text-gray-500 hover:text-gray-300 transition-colors" />
                          </RangePopover>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {loading.sentiment ? (
                        <>
                          <Skeleton className="h-6 w-12 !bg-gray-700" />
                          <Skeleton className="h-4 w-16 rounded-full !bg-gray-700" />
                        </>
                      ) : (
                        <>
                          <span
                            className={`text-base sm:text-lg font-bold ${
                              breadthData?.level === "bullish"
                                ? "text-emerald-400"
                                : breadthData?.level === "bearish"
                                  ? "text-red-400"
                                  : "text-gray-400"
                            }`}
                          >
                            {breadthData?.advanceDecline?.ratio?.toFixed(2) ?? "\u2014"}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              breadthData?.level === "bullish"
                                ? "bg-emerald-900/50 text-emerald-300"
                                : breadthData?.level === "bearish"
                                  ? "bg-red-900/50 text-red-300"
                                  : "bg-gray-700 text-gray-400"
                            }`}
                          >
                            {breadthData?.level ? breadthData.level.charAt(0).toUpperCase() + breadthData.level.slice(1) : "\u2014"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── AI Insights ─────────────────────────── */}
            <div className="card !p-4 border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  AI Market Insights
                </h3>
                <div className="flex items-center gap-2">
                  {insightsData?.generatedAt && (
                    <span className="text-[10px] text-gray-400">
                      {formatDate(insightsData.generatedAt)}
                    </span>
                  )}
                  <button
                    onClick={regenerateInsights}
                    disabled={generating}
                    className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generating ? "Generating..." : "Regenerate"}
                  </button>
                </div>
              </div>
              {insightsError && (
                <div className="bg-red-50 text-red-700 text-xs p-2 rounded mb-2">
                  {insightsError === "GEMINI_API_KEY not configured"
                    ? "Add GEMINI_API_KEY to enable AI insights"
                    : insightsError}
                </div>
              )}
              {generating ? (
                <div className="flex items-center gap-2 text-gray-500 py-3 text-xs">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Analyzing macro indicators...
                </div>
              ) : loading.insights ? (
                <div className="space-y-1.5 animate-pulse">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ) : insightsData?.insights ? (
                <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-semibold prose-h2:text-sm prose-h2:mt-3 prose-h2:mb-1 prose-ul:my-1 prose-li:my-0.5 text-xs">
                  <ReactMarkdown>{insightsData.insights}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-gray-500 text-xs py-2">
                  No insights yet. Click &quot;Regenerate&quot; to analyze current conditions.
                </div>
              )}
            </div>

            {/* ── Market Barometers (ETFs) ─────────────── */}
            <div>
              <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
                <span className="flex items-center text-gray-400"><BarChart3 className="w-3.5 h-3.5" /></span>
                Market Barometers
              </h3>
              {loading.etfs ? (
                <div className="card !p-3 text-xs text-gray-400">Loading barometers...</div>
              ) : marketEtfs.length > 0 ? (
                <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
                  {marketEtfs.map((etf) => {
                    const etfId = `etf-${etf.ticker}`;
                    return (
                      <div key={etf.ticker}>
                        <button
                          onClick={() => toggleExpanded(etfId)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                        >
                          <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has(etfId) ? "rotate-90" : ""}`} />
                          <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">{etf.name}</span>
                          <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                            {etf.data ? `$${etf.data.price.toFixed(2)}` : "\u2014"}
                          </span>
                          {etf.data && (
                            <span className={`text-[10px] tabular-nums shrink-0 ${etf.data.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {etf.data.changePercent >= 0 ? "+" : ""}{etf.data.changePercent.toFixed(2)}%
                            </span>
                          )}
                          {etf.interpretation && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${etfColorMap[etf.interpretation.color] || "bg-gray-100 text-gray-700"}`}>
                              {etf.interpretation.label}
                            </span>
                          )}
                        </button>
                        {expandedIds.has(etfId) && (
                          <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                            <p className="text-xs text-gray-500 mb-3">{etf.description}</p>
                            {etf.data && (
                              <div className="mb-3">
                                <div className="flex items-center gap-2 text-xs mb-1.5">
                                  <span className="text-gray-500">Daily:</span>
                                  <span className={`font-medium ${etf.data.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                    {etf.data.change >= 0 ? "+" : ""}{etf.data.change.toFixed(2)} ({etf.data.changePercent >= 0 ? "+" : ""}{etf.data.changePercent.toFixed(2)}%)
                                  </span>
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                  <span>52W Low: ${etf.data.fiftyTwoWeekLow.toFixed(2)}</span>
                                  <span>52W High: ${etf.data.fiftyTwoWeekHigh.toFixed(2)}</span>
                                </div>
                                <div className="relative h-1.5 bg-gray-200 rounded-full">
                                  <div className="absolute top-0 left-0 h-full bg-blue-500 rounded-full" style={{ width: `${etf.data.rangePosition}%` }} />
                                  <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-600 border-2 border-white rounded-full shadow" style={{ left: `${etf.data.rangePosition}%`, marginLeft: "-5px" }} />
                                </div>
                                <div className="flex gap-3 mt-1.5 text-[10px] text-gray-400">
                                  <span>50D: ${etf.data.fiftyDayAvg.toFixed(2)}</span>
                                  <span>200D: ${etf.data.twoHundredDayAvg.toFixed(2)}</span>
                                  <span>{etf.data.rangePosition}th pctl</span>
                                </div>
                              </div>
                            )}
                            <div className="bg-gray-50 rounded-lg p-2.5 mb-2.5">
                              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
                              <p className="text-xs text-gray-700">{etf.whyItMatters}</p>
                            </div>
                            {etf.interpretation && (
                              <div className="bg-blue-50 rounded-lg p-2.5 mb-2.5">
                                <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
                                <p className="text-xs text-gray-700">{etf.interpretation.meaning}</p>
                              </div>
                            )}
                            <div className="mb-2.5">
                              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                              <div className="space-y-1">
                                {etf.ranges.map((range, idx) => (
                                  <div
                                    key={idx}
                                    className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${
                                      etf.interpretation?.label === range.label
                                        ? (etfColorMap[range.color] || "bg-gray-100 text-gray-700") + " ring-1 ring-offset-1 ring-gray-300"
                                        : "bg-gray-50"
                                    }`}
                                  >
                                    <span className="font-medium w-24 shrink-0">{range.label}</span>
                                    <span className="text-gray-500 w-16 shrink-0">
                                      {range.min !== null ? `$${range.min}` : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? `$${range.max}` : "+"}
                                    </span>
                                    <span className="text-gray-600 flex-1">{range.meaning}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
                              <div className="flex flex-wrap gap-1">
                                {etf.affectedAssets.map((asset, idx) => (
                                  <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{asset}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="card !p-3 text-xs text-gray-400">No barometer data available</div>
              )}
            </div>

            {/* ── Market Sentiment ─────────────────────── */}
            <div>
              <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
                <span className="flex items-center text-gray-400"><Gauge className="w-3.5 h-3.5" /></span>
                Market Sentiment
              </h3>
              <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
                {/* VIX Row */}
                {sentimentData ? (
                  <div>
                    <button
                      onClick={() => toggleExpanded("sentiment-vix")}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("sentiment-vix") ? "rotate-90" : ""}`} />
                      <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">VIX (Fear Index)</span>
                      <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{sentimentData.vix.value?.toFixed(2) ?? "\u2014"}</span>
                      {sentimentData.vix.level && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                          sentimentData.vix.level === "low" ? "bg-emerald-100 text-emerald-700" :
                          sentimentData.vix.level === "moderate" ? "bg-blue-100 text-blue-700" :
                          sentimentData.vix.level === "elevated" ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {sentimentData.vix.level.charAt(0).toUpperCase() + sentimentData.vix.level.slice(1)}
                        </span>
                      )}
                    </button>
                    {expandedIds.has("sentiment-vix") && (
                      <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                        {sentimentData.vix.change != null && (
                          <div className="flex items-center gap-2 text-xs mb-2">
                            <span className="text-gray-500">Change:</span>
                            <span className={`font-medium ${sentimentData.vix.change >= 0 ? "text-red-600" : "text-emerald-600"}`}>
                              {sentimentData.vix.change >= 0 ? "+" : ""}{sentimentData.vix.change.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <p className="text-[10px] text-gray-500">The CBOE Volatility Index measures market expectations for near-term volatility. Higher values indicate greater fear in the market.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2.5 text-xs text-gray-400">Loading VIX data...</div>
                )}

                {/* Put/Call Row */}
                {sentimentData ? (
                  <div>
                    <button
                      onClick={() => toggleExpanded("sentiment-putcall")}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("sentiment-putcall") ? "rotate-90" : ""}`} />
                      <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">Put/Call Ratio</span>
                      <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{sentimentData.putCall.value?.toFixed(2) ?? "\u2014"}</span>
                      {sentimentData.putCall.level && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                          sentimentData.putCall.level === "greedy" ? "bg-amber-100 text-amber-700" :
                          sentimentData.putCall.level === "neutral" ? "bg-emerald-100 text-emerald-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {sentimentData.putCall.level.charAt(0).toUpperCase() + sentimentData.putCall.level.slice(1)}
                        </span>
                      )}
                    </button>
                    {expandedIds.has("sentiment-putcall") && (
                      <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                        {sentimentData.putCall.source && <p className="text-[10px] text-gray-400 mb-1">Source: {sentimentData.putCall.source}</p>}
                        <p className="text-[10px] text-gray-500">Ratio of put options to call options. Values above 1.0 indicate bearish sentiment (more puts), below 0.7 indicates greed (more calls).</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2.5 text-xs text-gray-400">Loading put/call data...</div>
                )}

                {/* Breadth Row */}
                {breadthData ? (
                  <div>
                    <button
                      onClick={() => toggleExpanded("sentiment-breadth")}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("sentiment-breadth") ? "rotate-90" : ""}`} />
                      <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">Market Breadth</span>
                      <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                        {breadthData.advanceDecline.advances ?? "\u2014"} / {breadthData.advanceDecline.declines ?? "\u2014"}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                        breadthData.level === "bullish" ? "bg-emerald-100 text-emerald-700" :
                        breadthData.level === "bearish" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {breadthData.level.charAt(0).toUpperCase() + breadthData.level.slice(1)}
                      </span>
                    </button>
                    {expandedIds.has("sentiment-breadth") && (
                      <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-gray-500">A/D Ratio:</span>
                            <span className="font-medium">{breadthData.advanceDecline.ratio?.toFixed(2) ?? "\u2014"}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-gray-500">New Highs / Lows:</span>
                            <span className="font-medium text-emerald-600">{breadthData.newHighsLows?.newHighs ?? "\u2014"}</span>
                            <span className="text-gray-400">/</span>
                            <span className="font-medium text-red-600">{breadthData.newHighsLows?.newLows ?? "\u2014"}</span>
                          </div>
                          {breadthData.mcclellan?.oscillator != null && (
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-gray-500">McClellan:</span>
                              <span className={`font-medium ${(breadthData.mcclellan?.oscillator ?? 0) > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {breadthData.mcclellan?.oscillator?.toFixed(1) ?? "\u2014"}
                              </span>
                            </div>
                          )}
                          <p className="text-[10px] text-gray-500">{breadthData.interpretation}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2.5 text-xs text-gray-400">Loading breadth data...</div>
                )}

                {/* VIX Term Structure Row */}
                {sentimentData?.volatilityContext && (
                  <div>
                    <button
                      onClick={() => toggleExpanded("sentiment-termstructure")}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("sentiment-termstructure") ? "rotate-90" : ""}`} />
                      <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">VIX Term Structure</span>
                      <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{sentimentData.volatilityContext.termStructure.toFixed(2)}x</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                        sentimentData.volatilityContext.contango === "backwardation" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {sentimentData.volatilityContext.contango.charAt(0).toUpperCase() + sentimentData.volatilityContext.contango.slice(1)}
                      </span>
                    </button>
                    {expandedIds.has("sentiment-termstructure") && (
                      <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                        <p className="text-[10px] text-gray-500">{sentimentData.volatilityContext.interpretation}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Smart Money Signals ──────────────────── */}
            <div>
              <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
                <span className="flex items-center text-gray-400"><Users className="w-3.5 h-3.5" /></span>
                Smart Money Signals
              </h3>
              <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
                {/* Congress Row */}
                {congressData ? (
                  <div>
                    <button
                      onClick={() => toggleExpanded("smart-congress")}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("smart-congress") ? "rotate-90" : ""}`} />
                      <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">Congress Trading</span>
                      <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                        {congressData.totalTrades > 0 ? `${congressData.ratio.toFixed(1)}x B/S` : "No data"}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                        congressData.totalTrades === 0 ? "bg-gray-100 text-gray-700" :
                        congressData.level === "bullish" ? "bg-emerald-100 text-emerald-700" :
                        congressData.level === "bearish" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {congressData.totalTrades === 0 ? "No Data" : congressData.level.charAt(0).toUpperCase() + congressData.level.slice(1)}
                      </span>
                    </button>
                    {expandedIds.has("smart-congress") && (
                      <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                        {congressData.totalTrades > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-4 text-xs">
                              <div><span className="text-gray-500">Buys: </span><span className="font-medium text-emerald-600">{congressData.buyCount}</span></div>
                              <div><span className="text-gray-500">Sells: </span><span className="font-medium text-red-600">{congressData.sellCount}</span></div>
                              <div><span className="text-gray-500">Ratio: </span><span className="font-medium">{congressData.ratio.toFixed(2)}</span></div>
                            </div>
                            {congressData.topTickers.length > 0 && (
                              <div>
                                <span className="text-[10px] text-gray-500">Most Traded</span>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {congressData.topTickers.slice(0, 5).map((t) => (
                                    <span key={t.ticker} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{t.ticker} ({t.count})</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <p className="text-[10px] text-gray-400">STOCK Act filings from House &amp; Senate (last 90 days)</p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No Congress trades found in the last 90 days.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2.5 text-xs text-gray-400">Loading Congress trading data...</div>
                )}

                {/* Insider Row */}
                {insiderData ? (
                  <div>
                    <button
                      onClick={() => toggleExpanded("smart-insider")}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("smart-insider") ? "rotate-90" : ""}`} />
                      <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">Insider Trading</span>
                      <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                        {insiderData.totalTrades > 0 ? `${insiderData.ratio.toFixed(1)}x B/S` : "No data"}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                        insiderData.totalTrades === 0 ? "bg-gray-100 text-gray-700" :
                        insiderData.level === "bullish" ? "bg-emerald-100 text-emerald-700" :
                        insiderData.level === "bearish" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {insiderData.totalTrades === 0 ? "No Data" : insiderData.level.charAt(0).toUpperCase() + insiderData.level.slice(1)}
                      </span>
                    </button>
                    {expandedIds.has("smart-insider") && (
                      <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                        {insiderData.totalTrades > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-4 text-xs">
                              <div>
                                <span className="text-gray-500">Buys: </span>
                                <span className="font-medium text-emerald-600">{insiderData.buyCount}</span>
                                <span className="text-[10px] text-gray-400 ml-1">(${(insiderData.buyValue / 1e6).toFixed(1)}M)</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Sells: </span>
                                <span className="font-medium text-red-600">{insiderData.sellCount}</span>
                                <span className="text-[10px] text-gray-400 ml-1">(${(insiderData.sellValue / 1e6).toFixed(1)}M)</span>
                              </div>
                              <div><span className="text-gray-500">Ratio: </span><span className="font-medium">{insiderData.ratio.toFixed(2)}</span></div>
                            </div>
                            {insiderData.clusterBuys.length > 0 && (
                              <div>
                                <span className="text-[10px] text-gray-500">Cluster Buying (multiple insiders)</span>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {insiderData.clusterBuys.slice(0, 5).map((t) => (
                                    <span key={t.ticker} className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{t.ticker} ({t.buys} buys)</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <p className="text-[10px] text-gray-400">SEC Form 4 filings (last 14 days)</p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No insider trades found in the last 14 days.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2.5 text-xs text-gray-400">Loading insider trading data...</div>
                )}
              </div>
            </div>

            {/* ── Indicator Categories ─────────────────── */}
            {loading.macro ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-24 mb-1.5" />
                    <div className="card !p-0 divide-y divide-gray-100">
                      {[1, 2].map((j) => (
                        <div key={j} className="px-3 py-2.5 flex items-center gap-3">
                          <div className="w-3 h-3 bg-gray-200 rounded" />
                          <div className="h-3 bg-gray-200 rounded w-32 flex-1" />
                          <div className="h-3 bg-gray-200 rounded w-14" />
                          <div className="h-4 bg-gray-200 rounded-full w-16" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              categoryOrder.map((category) => {
                const categoryIndicators = grouped[category];
                if (!categoryIndicators?.length) return null;

                return (
                  <div key={category}>
                    <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
                      <span className="flex items-center text-gray-400">{categoryIcons[category]}</span>
                      {categoryLabels[category]}
                    </h3>
                    <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
                      {categoryIndicators.map((indicator) => (
                        <div key={indicator.id}>
                          <button
                            onClick={() => toggleExpanded(indicator.id)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                          >
                            <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has(indicator.id) ? "rotate-90" : ""}`} />
                            <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">{indicator.name}</span>
                            {indicator.category === "fx" && indicator.data && (() => {
                              const trend = getTrendArrow(indicator.data!.current, indicator.data!.avg);
                              return <span className={`text-xs ${trend.color} shrink-0`}>{trend.arrow}</span>;
                            })()}
                            <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{formatIndicatorVal(indicator)}</span>
                            {indicator.interpretation && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${getStatusColor(indicator.interpretation.label)}`}>
                                {indicator.interpretation.label}
                              </span>
                            )}
                            {indicator.percentile !== null && (
                              <div className="w-14 shrink-0 hidden sm:flex items-center gap-1">
                                <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${indicator.percentile}%` }} />
                                </div>
                                <span className="text-[9px] text-gray-400 tabular-nums">{indicator.percentile}th</span>
                              </div>
                            )}
                          </button>
                          {expandedIds.has(indicator.id) && (
                            <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                              <p className="text-xs text-gray-500 mb-2">{indicator.description}</p>
                              <IndicatorDetails indicator={indicator} />
                            </div>
                          )}
                        </div>
                      ))}
                      {/* Yield spreads under foreign-yields */}
                      {category === "foreign-yields" && yieldSpreads.map((spread) => {
                        const spreadId = `spread-${spread.name.toLowerCase().replace(/\s+/g, "-")}`;
                        const badgeColor = spread.color === "green"
                          ? "bg-emerald-100 text-emerald-700"
                          : spread.color === "amber"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-700";
                        return (
                          <div key={spreadId}>
                            <button
                              onClick={() => toggleExpanded(spreadId)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                            >
                              <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has(spreadId) ? "rotate-90" : ""}`} />
                              <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">{spread.name}</span>
                              <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                                {spread.value !== null ? `${spread.value}%` : "N/A"}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${badgeColor}`}>
                                {spread.interpretation}
                              </span>
                            </button>
                            {expandedIds.has(spreadId) && (
                              <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                                <p className="text-xs text-gray-500 mb-2">
                                  {spread.name === "US-Japan Spread"
                                    ? "Yield differential between US 10Y Treasury and Japan 10Y Government Bond. Measures yen carry trade attractiveness."
                                    : "Yield differential between US 10Y Treasury and Germany 10Y Bund. Reflects US-Europe monetary policy divergence."}
                                </p>
                                <div className="space-y-2">
                                  <div className="bg-blue-50 rounded-lg p-2.5">
                                    <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
                                    <p className="text-xs text-gray-700 mb-0.5"><strong>Status:</strong> {spread.interpretation}</p>
                                    <p className="text-xs text-gray-700"><strong>Market Impact:</strong> {spread.name === "US-Japan Spread"
                                      ? "Higher spread attracts capital to USD, pressures yen lower, and supports carry trade positions."
                                      : "Higher spread attracts capital to USD over EUR, reflects relative economic strength."}</p>
                                  </div>
                                  <div className="bg-gray-50 rounded-lg p-2.5">
                                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
                                    <p className="text-xs text-gray-700">
                                      {spread.name === "US-Japan Spread"
                                        ? "Japan\u2019s ultra-low rates make Yen the funding currency for global carry trades. When the spread narrows, carry trades unwind violently, causing global risk-off moves."
                                        : "The US-Europe yield gap drives transatlantic capital flows and EUR/USD direction. A narrowing spread can signal ECB hawkishness or Fed dovishness."}
                                    </p>
                                  </div>
                                  <div>
                                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                                    <div className="space-y-1">
                                      {[
                                        { label: "Attractive Carry", min: "3%", max: null, meaning: "Strong incentive for carry trades into USD assets", clr: "green" as const },
                                        { label: "Moderate Carry", min: "2%", max: "3%", meaning: "Carry trades viable but with lower margin of safety", clr: "amber" as const },
                                        { label: "Unattractive", min: null, max: "2%", meaning: "Carry trade unwind risk \u2014 capital may flow out of USD", clr: "amber" as const },
                                      ].map((range, idx) => {
                                        const isActive = spread.color === range.clr;
                                        const rowColor = range.clr === "green"
                                          ? "bg-emerald-100 text-emerald-700 ring-1 ring-offset-1 ring-gray-300"
                                          : "bg-amber-100 text-amber-700 ring-1 ring-offset-1 ring-gray-300";
                                        return (
                                          <div
                                            key={idx}
                                            className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${isActive ? rowColor : "bg-gray-50"}`}
                                          >
                                            <span className="font-medium w-24 shrink-0">{range.label}</span>
                                            <span className="text-gray-500 w-16 shrink-0 tabular-nums">
                                              {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? range.max : "+"}
                                            </span>
                                            <span className="text-gray-600 flex-1">{range.meaning}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div>
                                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
                                    <div className="flex flex-wrap gap-1">
                                      {(spread.name === "US-Japan Spread"
                                        ? ["Carry trades", "Japanese banks", "Global risk assets", "Yen", "US Treasuries"]
                                        : ["EUR/USD", "European equities", "US Treasuries", "Bunds", "Carry trades"]
                                      ).map((asset, idx) => (
                                        <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{asset}</span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DashboardCard>

        {/* Recent Research */}
        <DashboardCard
          title="Recent Research"
          icon={<FileText className="w-4 h-4" />}
          href="/markets/research"
          loading={loading.reports}
          loadingSkeleton={
            <>
              {/* Quick Research Form - always visible */}
              <div className="mb-4 pb-4 border-b border-gray-100">
                <QuickResearchForm />
              </div>
              {/* Skeleton report items */}
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="py-1.5">
                    <div className="flex items-center gap-2 mb-1">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-3 w-14" />
                  </div>
                ))}
              </div>
            </>
          }
        >
          {/* Quick Research Form */}
          <div className="mb-4 pb-4 border-b border-gray-100">
            <QuickResearchForm />
          </div>

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
                Enter a ticker above to start
              </p>
            </div>
          )}
        </DashboardCard>
      </div>
    </>
  );
}
