export interface Position {
  symbol: string;
  quantity: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dayChangePct: number;
  marketValueBase?: number;
  unrealizedPnlBase?: number;
}

export interface Summary {
  totalMarketValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPct: number;
  dayPnl: number;
  dayPnlPct: number;
}

export interface MacroIndicator {
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

export interface MarketEtf {
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

export interface RegimeData {
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

export interface SentimentData {
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

export interface BreadthData {
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

export interface CongressData {
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

export interface InsiderData {
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

export interface YieldSpread {
  name: string;
  value: number | null;
  interpretation: string;
  color: "green" | "amber" | "gray";
}

export interface GavekalQuadrantData {
  name: string;
  score: number;
  color: string;
  description: string;
  buySignals: string[];
  sellSignals: string[];
}

export interface GavekalRatioData {
  label: string;
  current: number;
  ma7y: number;
  signal: 1 | -1;
  history: { date: string; value: number; ma: number | null }[];
}

export interface GavekalExclusionData {
  name: string;
  signal: string;
  description: string;
}

export interface GavekalRegimePoint {
  date: string;
  quadrant: string;
}

export interface GavekalData {
  quadrant: GavekalQuadrantData;
  energyEfficiency: GavekalRatioData;
  currencyQuality: GavekalRatioData;
  keyRatios: {
    spGold: { current: number; ma7y: number };
    goldWti: { current: number; ma7y: number };
  };
  exclusions: GavekalExclusionData[];
  regimeHistory: GavekalRegimePoint[];
  updatedAt: string;
}

export interface CrowdingData {
  overall: {
    score: number;
    level: "contrarian" | "forming" | "crowded";
    description: string;
    components: {
      ownership: number;
      analyst: number;
      positioning: number;
    };
  };
  breakdown: Array<{
    ticker: string;
    name: string;
    score: number;
    level: "contrarian" | "forming" | "crowded";
  }>;
  sectors: Array<{
    ticker: string;
    name: string;
    score: number;
    level: "contrarian" | "forming" | "crowded";
  }>;
  timestamp: string;
}
