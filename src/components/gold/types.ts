export interface KeyLevel {
  level: number;
  significance: string;
}

export interface Scenario {
  name: string;
  probability: number;
  priceRange: string;
  description: string;
}

export interface GoldFlow {
  id: number;
  date: string;
  gldSharesOutstanding: number | null;
  gldNav: number | null;
  estimatedFlowUsd: number | null;
  globalEtfFlowUsd: number | null;
  centralBankTonnes: number | null;
  source: string | null;
}

export interface DxyData {
  price: number;
  change: number;
  changePercent: number;
}

export interface RealYieldsData {
  value: number;
  tnx: number;
  cpi: number;
  change: number;
  changePercent: number;
}

export interface GoldData {
  analysis: {
    id: number;
    currentPrice: number | null;
    ath: number | null;
    athDate: string | null;
    keyLevels: KeyLevel[];
    scenarios: Scenario[];
    thesisNotes: string | null;
    updatedAt: string | null;
  } | null;
  livePrice: number | null;
  gld: {
    price: number | null;
    sharesOutstanding: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    change: number | null;
    changePercent: number | null;
  } | null;
  dxy: DxyData | null;
  realYields: RealYieldsData | null;
  flows: GoldFlow[];
}
