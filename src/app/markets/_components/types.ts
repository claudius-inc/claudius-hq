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
  // The fields below are UI-only metadata that may be merged in client-side
  // from a static config; the lib `fetchMacroData()` does not populate them.
  description?: string;
  whyItMatters?: string;
  ranges?: Array<{ label: string; min: number | null; max: number | null; meaning: string; marketImpact: string }>;
  keyLevels?: Array<{ level: number; significance: string }>;
  affectedAssets?: string[];
  data: { current: number; min: number; max: number; avg: number } | null;
  interpretation: { label: string; meaning: string; marketImpact?: string } | null;
  percentile: number | null;
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
  // Fields are nullable because the underlying DB rows can have nulls.
  recentTrades: Array<{
    date: string | null;
    member: string | null;
    party: string | null;
    state: string | null;
    chamber: string | null;
    ticker: string;
    type: string;
    amount: string | null;
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
  // Fields are nullable because the underlying DB rows can have nulls.
  recentTrades: Array<{
    date: string | null;
    company: string | null;
    ticker: string;
    insider: string | null;
    title: string | null;
    type: string;
    shares: number | null;
    price: number | null;
    value: number | null;
  }>;
}

export type TileAction = "own" | "avoid" | "hold";

export interface GavekalQuadrantData {
  name: string;
  score: number;
  color: string;
  description: string;
  buySignals: string[];
  sellSignals: string[];
  tileActions: {
    equities: TileAction;
    bonds: TileAction;
    gold: TileAction;
    commodities: TileAction;
    cash: TileAction;
  };
}

export interface GavekalRatioData {
  label: string;
  current: number;
  ma7y: number;
  signal: 1 | -1;
  history: { date: string; value: number; ma: number | null }[];
}

export interface GavekalRegimePoint {
  date: string;
  quadrant: string;
}

export interface GavekalXleData {
  price: number | null;
  changePercent: number | null;
  xleSpyRatio: number | null;
  trailingPE: number | null;
  dividendYield: number | null;
  xleSpyHistory: { date: string; value: number; ma: number | null }[];
  energyPctOfSp500: number | null;
  xleWtiCorrelation: number | null;
}

export interface GavekalRegimeReturns {
  equities: number;
  bonds: number;
  gold: number;
  commodities: number;
  cash: number;
}

export interface PortfolioAllocation {
  asset: string;
  vehicle: string;
  weight: string;
}

export interface GavekalData {
  quadrant: GavekalQuadrantData;
  energyEfficiency: GavekalRatioData;
  currencyQuality: GavekalRatioData;
  keyRatios: {
    spGold: {
      current: number;
      ma7y: number;
      history: { date: string; value: number; ma: number | null }[];
    };
    goldWti: {
      current: number;
      ma7y: number;
      history: { date: string; value: number; ma: number | null }[];
    };
  };
  regimeHistory: GavekalRegimePoint[];
  xle?: GavekalXleData;
  regimeReturns?: Record<string, GavekalRegimeReturns>;
  portfolioAllocation?: PortfolioAllocation[];
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
