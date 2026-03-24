export interface ScanResult {
  rank: number;
  ticker: string;
  name: string;
  price: number | null;
  mcapB: string;
  totalScore: number;
  tier: string;
  tierColor: string;
  riskTier: string;
  market?: "US" | "SGX" | "HK" | "JP";
  growth: { score: number; max: number; details: string[] };
  financial: { score: number; max: number; details: string[] };
  insider: { score: number; max: number; details: string[] };
  technical: { score: number; max: number; details: string[] };
  analyst: { score: number; max: number; details: string[] };
  risk: { penalty: number; flags: string[] };
  revGrowth: number | null;
  grossMargin: number | null;
  // Enhanced technical metrics (from dynamic refresh)
  athWeekly?: number | null;
  athMonthly?: number | null;
  rvolWeekly?: number | null;
  rvolMonthly?: number | null;
  atrWeekly?: number | null;
  rrWeekly?: number | null;
  compositeScore?: number;
  fundamentalScore?: number;
  technicalScore?: number;
  momentumScore?: number;
}

export interface ScanSummary {
  universeSize: number;
  scannedCount: number;
  highConviction: number;
  speculative: number;
  watchlist: number;
  avoid: number;
  usCount?: number;
  sgxCount?: number;
  hkCount?: number;
  jpCount?: number;
}

export interface ParsedScan {
  id: number;
  scanType: string;
  scannedAt: string | null;
  stockCount: number | null;
  results: ScanResult[];
  summary: ScanSummary | null;
}
