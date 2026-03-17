import {
  TrendingUp,
  Flame,
  HardHat,
  Factory,
  CreditCard,
  ArrowLeftRight,
  Globe,
  Droplets,
} from "lucide-react";
import { createElement } from "react";

export const erpRanges = [
  { label: "Negative", min: null, max: 0, meaning: "Stocks yield less than risk-free bonds — only seen during dot-com bubble and 2024-26", marketImpact: "Historically rare, preceded major equity drawdowns" },
  { label: "Thin", min: 0, max: 2, meaning: "Below-average premium (median ~4%) — limited compensation for equity risk", marketImpact: "Bonds competitive, equities priced for perfection" },
  { label: "Fair", min: 2, max: 4, meaning: "Normal range — adequate compensation for equity volatility", marketImpact: "Balanced risk/reward between stocks and bonds" },
  { label: "Attractive", min: 4, max: 6, meaning: "Above-average premium — equities offer meaningful edge over bonds", marketImpact: "Favor equities, historically strong forward returns" },
  { label: "Extreme", min: 6, max: null, meaning: "Crisis-level premium — seen in 2008-09, early 1980s recessions", marketImpact: "Generational equity buying opportunity if economy stabilizes" },
];

export const vixRanges = [
  { label: "Low", min: null, max: 15, meaning: "Complacency, low fear", marketImpact: "Bullish but watch for reversal" },
  { label: "Moderate", min: 15, max: 20, meaning: "Normal market conditions", marketImpact: "Healthy risk appetite" },
  { label: "Elevated", min: 20, max: 30, meaning: "Rising uncertainty", marketImpact: "Increased hedging activity" },
  { label: "Fear", min: 30, max: null, meaning: "Panic or crisis conditions", marketImpact: "Potential capitulation/buying opportunity" },
];

export const putCallRanges = [
  { label: "Greedy", min: null, max: 0.7, meaning: "More calls than puts, bullish bets", marketImpact: "Contrarian bearish signal" },
  { label: "Neutral", min: 0.7, max: 1.0, meaning: "Balanced options activity", marketImpact: "No strong directional bias" },
  { label: "Fearful", min: 1.0, max: null, meaning: "More puts than calls, hedging", marketImpact: "Contrarian bullish signal" },
];

export const breadthRanges = [
  { label: "Bearish", min: null, max: 0.7, meaning: "More declines than advances", marketImpact: "Broad-based selling pressure" },
  { label: "Neutral", min: 0.7, max: 1.3, meaning: "Balanced market participation", marketImpact: "No strong breadth signal" },
  { label: "Bullish", min: 1.3, max: null, meaning: "More advances than declines", marketImpact: "Broad-based buying, healthy rally" },
];

export const termStructureRanges = [
  { label: "Steep Contango", min: null, max: 0.85, meaning: "Near-term vol much lower than long-term", marketImpact: "Complacency — markets calm, but watch for sudden spikes" },
  { label: "Normal Contango", min: 0.85, max: 0.95, meaning: "Typical term structure, futures above spot", marketImpact: "Healthy risk appetite, no unusual stress" },
  { label: "Flat", min: 0.95, max: 1.05, meaning: "Near-term and long-term vol roughly equal", marketImpact: "Transitional — could go either way" },
  { label: "Backwardation", min: 1.05, max: 1.15, meaning: "Near-term fear exceeds long-term", marketImpact: "Elevated short-term hedging demand" },
  { label: "Deep Backwardation", min: 1.15, max: null, meaning: "Inverted curve — acute near-term stress", marketImpact: "Panic hedging, potential capitulation signal" },
];

export const congressRanges = [
  { label: "Strongly Bearish", min: null, max: 0.5, meaning: "Congress selling far more than buying", marketImpact: "Insiders may anticipate headwinds — contrarian caution" },
  { label: "Bearish", min: 0.5, max: 0.8, meaning: "More sells than buys among legislators", marketImpact: "Potential policy/economic concerns" },
  { label: "Neutral", min: 0.8, max: 1.2, meaning: "Balanced buying and selling activity", marketImpact: "No strong directional signal" },
  { label: "Bullish", min: 1.2, max: 2.0, meaning: "Congress buying more than selling", marketImpact: "Legislators deploying capital — potential positive catalyst" },
  { label: "Strongly Bullish", min: 2.0, max: null, meaning: "Heavy net buying by legislators", marketImpact: "High conviction buys — watch for upcoming legislation" },
];

export const insiderRanges = [
  { label: "Heavy Selling", min: null, max: 0.3, meaning: "Insiders selling aggressively", marketImpact: "May signal overvaluation or company-specific concerns" },
  { label: "Net Selling", min: 0.3, max: 0.8, meaning: "More insider sales than purchases", marketImpact: "Normal profit-taking, but watch for clusters" },
  { label: "Neutral", min: 0.8, max: 1.2, meaning: "Balanced insider activity", marketImpact: "No strong signal from corporate insiders" },
  { label: "Net Buying", min: 1.2, max: 2.0, meaning: "Insiders buying their own stock", marketImpact: "Positive signal — insiders see value" },
  { label: "Heavy Buying", min: 2.0, max: null, meaning: "Significant insider purchases", marketImpact: "Strong conviction — historically bullish signal" },
];

export const realYieldRanges = [
  { label: "Deeply Negative", min: null, max: -1, meaning: "Severe financial repression, savers punished", marketImpact: "Gold & real assets outperform" },
  { label: "Negative", min: -1, max: 0, meaning: "Accommodative real rates, mild repression", marketImpact: "Risk assets favored, dollar weakens" },
  { label: "Low Positive", min: 0, max: 1, meaning: "Neutral real rate environment", marketImpact: "Balanced conditions for most assets" },
  { label: "Moderate", min: 1, max: 2, meaning: "Positive real returns on safe assets", marketImpact: "Cash & bonds competitive, growth headwinds" },
  { label: "Restrictive", min: 2, max: null, meaning: "Tight policy, high hurdle rate", marketImpact: "Headwind for equities & gold, bonds attractive" },
];

export const debtToGdpRanges = [
  { label: "Low", min: null, max: 60, meaning: "Healthy fiscal position, room for spending", marketImpact: "Strong sovereign credit, low risk premium" },
  { label: "Moderate", min: 60, max: 90, meaning: "Manageable debt, some constraints", marketImpact: "Normal market conditions" },
  { label: "Elevated", min: 90, max: 120, meaning: "High debt burden, sustainability concerns", marketImpact: "Rising risk premium on treasuries" },
  { label: "Critical", min: 120, max: null, meaning: "Fiscal dominance zone, debt constrains policy", marketImpact: "Currency debasement risk, hard assets favored" },
];

export const deficitToGdpRanges = [
  { label: "Surplus", min: null, max: 0, meaning: "Government running a budget surplus", marketImpact: "Fiscal tightening, lower bond supply" },
  { label: "Low", min: 0, max: 3, meaning: "Sustainable deficit level", marketImpact: "Manageable treasury issuance" },
  { label: "Elevated", min: 3, max: 6, meaning: "Above-normal deficit, expansionary fiscal", marketImpact: "Increased bond supply, rising yields" },
  { label: "High", min: 6, max: null, meaning: "Unsustainable deficit, funding pressure", marketImpact: "Bond vigilante risk, monetization pressure" },
];

export const categoryLabels: Record<string, string> = {
  rates: "Rates & Credit",
  inflation: "Inflation",
  employment: "Employment",
  growth: "Economic Growth",
  credit: "Credit Markets",
  fx: "FX Rates",
  "foreign-yields": "Foreign Yields",
  liquidity: "Liquidity & Fed Balance Sheet",
};

export const categoryIcons: Record<string, React.ReactNode> = {
  rates: createElement(TrendingUp, { className: "w-4 h-4" }),
  inflation: createElement(Flame, { className: "w-4 h-4" }),
  employment: createElement(HardHat, { className: "w-4 h-4" }),
  growth: createElement(Factory, { className: "w-4 h-4" }),
  credit: createElement(CreditCard, { className: "w-4 h-4" }),
  fx: createElement(ArrowLeftRight, { className: "w-4 h-4" }),
  "foreign-yields": createElement(Globe, { className: "w-4 h-4" }),
  liquidity: createElement(Droplets, { className: "w-4 h-4" }),
};

export const categoryOrder = ["rates", "liquidity", "inflation", "employment", "growth", "fx", "foreign-yields"];

export const etfColorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  gray: "bg-gray-100 text-gray-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  green: "bg-emerald-100 text-emerald-700",
};
