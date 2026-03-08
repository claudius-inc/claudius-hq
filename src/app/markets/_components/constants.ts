import {
  TrendingUp,
  Flame,
  HardHat,
  Factory,
  CreditCard,
  ArrowLeftRight,
  Globe,
} from "lucide-react";
import { createElement } from "react";

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
  rates: "Interest Rates",
  inflation: "Inflation",
  employment: "Employment",
  growth: "Economic Growth",
  credit: "Credit Markets",
  fx: "FX Rates",
  "foreign-yields": "Foreign Yields",
};

export const categoryIcons: Record<string, React.ReactNode> = {
  rates: createElement(TrendingUp, { className: "w-4 h-4" }),
  inflation: createElement(Flame, { className: "w-4 h-4" }),
  employment: createElement(HardHat, { className: "w-4 h-4" }),
  growth: createElement(Factory, { className: "w-4 h-4" }),
  credit: createElement(CreditCard, { className: "w-4 h-4" }),
  fx: createElement(ArrowLeftRight, { className: "w-4 h-4" }),
  "foreign-yields": createElement(Globe, { className: "w-4 h-4" }),
};

export const categoryOrder = ["rates", "inflation", "employment", "growth", "credit", "fx", "foreign-yields"];

export const etfColorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  gray: "bg-gray-100 text-gray-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  green: "bg-emerald-100 text-emerald-700",
};
