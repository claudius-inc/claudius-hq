#!/usr/bin/env npx tsx
/**
 * GitHub Actions Stock Scanner
 * 
 * Standalone scanner script that runs in GitHub Actions.
 * Scans US and SGX stocks, calculates scores, and stores results in Turso DB.
 * 
 * Usage:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/run-scanner.ts
 * 
 * Environment:
 *   TURSO_DATABASE_URL - Turso database URL
 *   TURSO_AUTH_TOKEN - Turso auth token
 *   SCAN_MARKETS - Comma-separated markets to scan (default: US,SGX)
 */

import { createClient } from "@libsql/client";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

// ── Configuration ────────────────────────────────────────────────────────────

const RATE_LIMIT_MS = 400; // 400ms between Yahoo Finance calls
let lastRequestTime = 0;

// ── Dynamic Stock Universe ───────────────────────────────────────────────────

// Screeners to fetch US stocks from (dynamically discovers opportunities)
const US_SCREENERS = [
  "undervalued_large_caps",
  "undervalued_growth_stocks",
  "growth_technology_stocks",
  "aggressive_small_caps",
  "small_cap_gainers",
  "day_gainers",
  "day_losers",
  "most_actives",
];

// Curated US tickers (always include these high-conviction names)
const US_CURATED = [
  // AI Infrastructure
  "NBIS", "CRWV", "APLD", "SMCI", "VRT", "ANET",
  // AI Software/Platform  
  "PLTR", "SNOW", "DDOG", "MDB", "NET", "CFLT",
  // Cybersecurity
  "CRWD", "PANW", "ZS", "S",
  // Fintech / Payments
  "AFRM", "SOFI", "DLO", "TOST", "SQ", "PYPL",
  // E-commerce / Consumer
  "SHOP", "MELI", "SE", "DUOL", "AMZN",
  // Healthcare Tech
  "HIMS", "DOCS", "CERT",
  // Clean Energy / EV
  "ENPH", "SEDG", "RIVN", "LCID", "TSLA",
  // Space / Defense Tech
  "RKLB", "PL", "ASTS",
  // Mega caps (benchmarks)
  "AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMD",
  // Other High Growth
  "CELH", "AXON", "TTD", "BILL",
];

// Comprehensive SGX tickers (~200 main listed stocks)
const SGX_TICKERS = [
  // ── STI Components (30) ──
  "D05.SI", "O39.SI", "U11.SI", "Z74.SI", "C6L.SI", "C09.SI",
  "S58.SI", "U14.SI", "S63.SI", "V03.SI", "BS6.SI", "G13.SI",
  "BN4.SI", "Y92.SI", "F34.SI", "S68.SI", "H78.SI", "U96.SI",
  "9CI.SI", "A17U.SI", "M44U.SI", "N2IU.SI", "ME8U.SI", "BUOU.SI",
  "J36.SI", "C38U.SI", "J69U.SI", "T39.SI", "CC3.SI", "C52.SI",
  
  // ── Banks & Financials ──
  "D05.SI", "O39.SI", "U11.SI", "S63.SI", "BN4.SI", "S56.SI",
  "H02.SI", "E5H.SI", "BHG.SI", "OV8.SI", "BRS.SI",
  
  // ── REITs (comprehensive) ──
  "A17U.SI", "M44U.SI", "N2IU.SI", "ME8U.SI", "BUOU.SI", "C38U.SI",
  "J69U.SI", "T82U.SI", "SK6U.SI", "OXMU.SI", "AU8U.SI", "BTOU.SI",
  "AJBU.SI", "CRPU.SI", "CY6U.SI", "JYEU.SI", "A7RU.SI", "C2PU.SI",
  "J91U.SI", "DHLU.SI", "K71U.SI", "UD1U.SI", "MXNU.SI", "HMN.SI",
  "CWBU.SI", "C61U.SI", "Q1P.SI", "TS0U.SI", "RW0U.SI", "CLAS.SI",
  
  // ── Property Developers ──
  "C09.SI", "U14.SI", "H78.SI", "F25.SI", "P40U.SI", "S59.SI",
  "OV8.SI", "A26.SI", "L38.SI", "E28.SI", "H13.SI", "NO4.SI",
  "U06.SI", "H15.SI", "N03.SI", "K03.SI", "P9D.SI", "N01.SI",
  
  // ── Tech & Semiconductors ──
  "BN2.SI", "AWX.SI", "V03.SI", "S85.SI", "1D0.SI", "BDR.SI",
  "EB5.SI", "5GD.SI", "AZR.SI", "Y35.SI", "RF7.SI", "5GI.SI",
  "BHK.SI", "5HG.SI", "1A1.SI", "L02.SI", "T14.SI", "5CF.SI",
  
  // ── Consumer & Retail ──
  "F34.SI", "Y92.SI", "G13.SI", "BQF.SI", "5CF.SI", "E3B.SI",
  "5DD.SI", "OYY.SI", "AGS.SI", "5GF.SI", "502.SI", "A04.SI",
  "T39.SI", "5OI.SI", "EB5.SI", "42S.SI", "40T.SI", "1A4.SI",
  
  // ── Industrials & Manufacturing ──
  "S68.SI", "U96.SI", "BN4.SI", "S51.SI", "P8Z.SI", "544.SI",
  "564.SI", "S08.SI", "NR7.SI", "CFA.SI", "J85.SI", "5JS.SI",
  "T15.SI", "5AI.SI", "CHJ.SI", "F17.SI", "TQ5.SI", "5G1.SI",
  "H30.SI", "C8R.SI", "5I4.SI", "YF8.SI", "Z25.SI",
  
  // ── Offshore & Marine ──
  "BS6.SI", "S51.SI", "BN2.SI", "S85.SI", "M05.SI", "5G4.SI",
  "BLU.SI", "5TP.SI", "AWG.SI", "O2I.SI",
  
  // ── Transport & Logistics ──
  "C6L.SI", "S58.SI", "5OQ.SI", "5I4.SI", "S59.SI", "BTP.SI",
  "5LY.SI", "ER0.SI", "Q0F.SI", "WJP.SI", "D01.SI",
  
  // ── Healthcare ──
  "Q0F.SI", "40T.SI", "5OT.SI", "1A0.SI", "BSL.SI", "MZH.SI",
  "U10.SI", "T13.SI", "Z59.SI", "S20.SI",
  
  // ── Telecoms & Media ──
  "Z74.SI", "CC3.SI", "S85.SI", "BDX.SI", "S71.SI",
  
  // ── Energy & Utilities ──
  "BN2.SI", "H02.SI", "P8Z.SI", "NC2.SI", "5TP.SI",
  
  // ── F&B ──
  "F34.SI", "5CF.SI", "RE4.SI", "CLW.SI", "BEW.SI", "AIY.SI",
  "GRQ.SI", "BKW.SI", "1F3.SI", "P15.SI", "U09.SI", "A30.SI",
];

// Comprehensive HKEX tickers (~150 major stocks)
const HK_TICKERS = [
  // ── HSI Components (Blue Chips) ──
  "0005.HK", "0011.HK", "0016.HK", "0017.HK", "0027.HK", "0066.HK",
  "0175.HK", "0241.HK", "0267.HK", "0288.HK", "0386.HK", "0388.HK",
  "0669.HK", "0700.HK", "0762.HK", "0823.HK", "0857.HK", "0883.HK",
  "0939.HK", "0941.HK", "0960.HK", "0968.HK", "1038.HK", "1044.HK",
  "1093.HK", "1109.HK", "1177.HK", "1211.HK", "1299.HK", "1398.HK",
  "1810.HK", "1876.HK", "1928.HK", "1997.HK", "2007.HK", "2018.HK",
  "2020.HK", "2269.HK", "2313.HK", "2318.HK", "2319.HK", "2331.HK",
  "2382.HK", "2388.HK", "2628.HK", "2688.HK", "3690.HK", "3968.HK",
  "3988.HK", "6098.HK", "6862.HK", "9618.HK", "9888.HK", "9988.HK",
  "9999.HK",
  
  // ── Tech Giants ──
  "0700.HK", "9988.HK", "9618.HK", "3690.HK", "9888.HK", "1810.HK",
  "2382.HK", "0268.HK", "0772.HK", "0981.HK", "1024.HK", "1347.HK",
  "2400.HK", "6618.HK", "9698.HK", "9626.HK", "9961.HK", "9999.HK",
  "0020.HK", "3888.HK", "6060.HK", "1833.HK", "9866.HK", "9868.HK",
  
  // ── Banks & Financials ──
  "0005.HK", "0011.HK", "0388.HK", "0939.HK", "1398.HK", "3988.HK",
  "3968.HK", "2388.HK", "2628.HK", "1299.HK", "2318.HK", "2601.HK",
  "0998.HK", "1658.HK", "6881.HK", "1988.HK", "3328.HK", "6060.HK",
  
  // ── Property Developers ──
  "0016.HK", "0017.HK", "0012.HK", "0001.HK", "0083.HK", "0101.HK",
  "0688.HK", "1109.HK", "0823.HK", "2007.HK", "0683.HK", "0003.HK",
  "0004.HK", "1113.HK", "0014.HK", "2202.HK", "0881.HK", "3383.HK",
  "1972.HK", "0960.HK", "2669.HK", "0813.HK", "3900.HK",
  
  // ── Consumer & Retail ──
  "0027.HK", "0291.HK", "0322.HK", "0151.HK", "1044.HK", "2020.HK",
  "0168.HK", "0220.HK", "2331.HK", "6862.HK", "9633.HK", "1458.HK",
  "0914.HK", "6969.HK", "2313.HK", "1928.HK", "0992.HK", "0175.HK",
  
  // ── Healthcare & Pharma ──
  "1177.HK", "2269.HK", "1093.HK", "2359.HK", "6160.HK", "1801.HK",
  "2196.HK", "1066.HK", "0241.HK", "3692.HK", "6127.HK", "9926.HK",
  "9995.HK", "2186.HK", "1952.HK", "6185.HK",
  
  // ── Industrials ──
  "0669.HK", "0762.HK", "0386.HK", "0857.HK", "0883.HK", "1088.HK",
  "0267.HK", "0288.HK", "1800.HK", "2600.HK", "0390.HK", "3898.HK",
  "1818.HK", "0358.HK", "0914.HK", "1071.HK", "0968.HK",
  
  // ── EV & Auto ──
  "1211.HK", "2015.HK", "0175.HK", "2238.HK", "9868.HK", "0489.HK",
  "1958.HK", "6699.HK", "2333.HK", "0867.HK", "0285.HK", "3808.HK",
  
  // ── Telecoms ──
  "0941.HK", "0728.HK", "0762.HK", "6823.HK",
  
  // ── Utilities & Energy ──
  "0002.HK", "0003.HK", "0006.HK", "0836.HK", "1038.HK", "0384.HK",
  "0135.HK", "2688.HK", "0270.HK", "1083.HK",
  
  // ── REITs ──
  "0823.HK", "2778.HK", "0435.HK", "0778.HK", "1881.HK", "1426.HK",
  "0405.HK", "1503.HK", "6823.HK", "0087.HK",
  
  // ── Insurance ──
  "1299.HK", "2318.HK", "2601.HK", "2628.HK", "0966.HK", "1336.HK",
  "6186.HK", "1339.HK", "2328.HK",
];

// Comprehensive Japan (TSE) tickers (~200 major stocks)
const JP_TICKERS = [
  // ── Nikkei 225 Core ──
  "7203.T", "6758.T", "9984.T", "6861.T", "8306.T", "8035.T", "9433.T",
  "6098.T", "4063.T", "6501.T", "7267.T", "4502.T", "4503.T", "4568.T",
  "6902.T", "7751.T", "7974.T", "8316.T", "8411.T", "9432.T", "9983.T",
  "6954.T", "8766.T", "8058.T", "8031.T", "3382.T", "7269.T", "2914.T",
  "6367.T", "4661.T", "6273.T", "6594.T", "4452.T", "9020.T", "9022.T",
  
  // ── Tech & Electronics ──
  "6702.T", "6752.T", "6753.T", "6762.T", "6770.T", "6857.T", "6920.T",
  "6146.T", "6503.T", "6504.T", "6506.T", "6645.T", "6723.T", "6724.T",
  "6981.T", "7735.T", "7752.T", "8035.T", "4689.T", "4751.T", "4755.T",
  "3659.T", "3938.T", "4385.T", "6035.T", "2371.T", "9613.T", "4307.T",
  
  // ── Autos & Transport ──
  "7201.T", "7202.T", "7205.T", "7211.T", "7261.T", "7270.T", "7272.T",
  "7276.T", "7282.T", "3086.T", "3099.T", "9064.T", "9020.T", "9021.T",
  "9101.T", "9104.T", "9107.T", "9201.T", "9202.T",
  
  // ── Finance & Banks ──
  "8303.T", "8304.T", "8308.T", "8309.T", "8331.T", "8354.T", "8355.T",
  "8473.T", "8591.T", "8595.T", "8601.T", "8604.T", "8628.T", "8630.T",
  "8697.T", "8725.T", "8750.T", "8795.T", "8801.T", "8802.T",
  
  // ── Trading Houses (Sogo Shosha) ──
  "8001.T", "8002.T", "8015.T", "8053.T", "8058.T",
  
  // ── Pharma & Healthcare ──
  "4507.T", "4519.T", "4523.T", "4528.T", "4543.T", "4578.T", "4581.T",
  "6479.T", "7733.T", "7741.T", "9989.T",
  
  // ── Consumer & Retail ──
  "2801.T", "2802.T", "2871.T", "2875.T", "3086.T", "3099.T", "3141.T",
  "4452.T", "7453.T", "7532.T", "8233.T", "8252.T", "8267.T", "8273.T",
  "9843.T", "9861.T", "2702.T", "3563.T", "8028.T",
  
  // ── Industrial & Materials ──
  "3401.T", "3402.T", "3407.T", "4004.T", "4005.T", "4021.T", "4042.T",
  "4183.T", "4188.T", "4208.T", "4901.T", "4911.T", "5020.T", "5101.T",
  "5108.T", "5201.T", "5214.T", "5301.T", "5332.T", "5333.T", "5401.T",
  "5406.T", "5411.T", "5631.T", "5706.T", "5711.T", "5713.T", "5714.T",
  "5801.T", "5802.T", "5803.T",
  
  // ── Real Estate & Construction ──
  "1801.T", "1802.T", "1803.T", "1812.T", "1925.T", "1928.T", "1963.T",
  "2501.T", "8801.T", "8802.T", "8804.T", "8830.T", "3003.T", "3289.T",
  
  // ── Utilities & Energy ──
  "9501.T", "9502.T", "9503.T", "9531.T", "9532.T", "5019.T", "5020.T",
  "5021.T", "1605.T", "1662.T", "1963.T",
  
  // ── Gaming & Entertainment ──
  "9684.T", "9697.T", "3765.T", "4816.T", "2432.T", "7832.T", "7974.T",
  "6460.T", "7936.T", "9766.T", "4751.T", "9602.T", "4680.T",
];

// Fetch tickers from Yahoo Finance screeners
async function fetchScreenerTickers(maxPerScreen = 100): Promise<Set<string>> {
  const tickers = new Set<string>();
  
  console.log("Fetching US stocks from screeners...");
  
  for (const screenId of US_SCREENERS) {
    try {
      const result = await (yahooFinance.screener as any)({ scrIds: screenId, count: maxPerScreen });
      const symbols = (result.quotes as Array<{ symbol: string }>)
        .map((q: { symbol: string }) => q.symbol)
        .filter((s: string) => !s.includes(".") || s.endsWith(".TO")); // US + Canada, skip non-US
      
      symbols.forEach((s: string) => tickers.add(s));
      console.log(`  ${screenId}: +${symbols.length} (total: ${tickers.size})`);
      await delay(500); // Rate limit between screener calls
    } catch (e: any) {
      console.log(`  ${screenId}: error - ${e.message?.slice(0, 50)}`);
    }
  }
  
  // Add curated tickers
  US_CURATED.forEach(t => tickers.add(t));
  console.log(`  + ${US_CURATED.length} curated → ${tickers.size} total US\n`);
  
  return tickers;
}

// Fetch tickers from database (scanner_universe table)
interface DBTicker {
  ticker: string;
  market: string;
  source: string;
  enabled: number;
}

async function fetchTickersFromDB(
  dbClient: ReturnType<typeof createClient>,
  markets: string[]
): Promise<Map<string, { market: string; source: "curated" | "discovered" }> | null> {
  try {
    const placeholders = markets.map(() => "?").join(", ");
    const result = await dbClient.execute({
      sql: `SELECT ticker, market, source, enabled FROM scanner_universe 
            WHERE market IN (${placeholders}) AND enabled = 1`,
      args: markets,
    });

    if (result.rows.length === 0) {
      console.log("No tickers found in database, using fallback lists\n");
      return null;
    }

    const tickerMap = new Map<string, { market: string; source: "curated" | "discovered" }>();
    for (const row of result.rows as unknown as DBTicker[]) {
      tickerMap.set(row.ticker, {
        market: row.market,
        source: row.source === "discovered" ? "discovered" : "curated",
      });
    }

    console.log(`Loaded ${tickerMap.size} tickers from database`);
    const values = Array.from(tickerMap.values());
    const byMarket = markets.map(
      (m) => `${m}: ${values.filter((v) => v.market === m).length}`
    );
    console.log(`  ${byMarket.join(" | ")}\n`);

    return tickerMap;
  } catch (error) {
    console.log(`Database fetch failed, using fallback: ${error}\n`);
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ScoreComponent {
  score: number;
  max: number;
  details: string[];
}

interface RiskAnalysis {
  penalty: number;
  flags: string[];
}

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
  market: "US" | "SGX" | "HK" | "JP";
  growth: ScoreComponent;
  financial: ScoreComponent;
  insider: ScoreComponent;
  technical: ScoreComponent;
  analyst: ScoreComponent;
  risk: RiskAnalysis;
  revGrowth: number | null;
  grossMargin: number | null;
  source: "curated" | "discovered";
}

interface ScanSummary {
  universeSize: number;
  scannedCount: number;
  highConviction: number;
  speculative: number;
  watchlist: number;
  avoid: number;
  usCount: number;
  sgxCount: number;
  hkCount: number;
  jpCount: number;
}

// ── Rate Limiting ────────────────────────────────────────────────────────────

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// ── Yahoo Finance Fetchers ───────────────────────────────────────────────────

interface ChartData {
  price: number;
  high52: number;
  low52: number;
  sma50: number | null;
  sma200: number | null;
  position52w: number;
  // New momentum fields
  momentum12m1m: number | null; // 12-1 month momentum (excluding last month)
  volatility90d: number | null; // 90-day volatility (std dev of daily returns)
}

async function getChartData(ticker: string): Promise<ChartData | null> {
  await rateLimit();
  
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    // Use chart() instead of historical() - handles null values better for SGX stocks
    const result = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    // chart() returns { quotes: [...] } structure
    const quotes = result.quotes || [];
    const closes = quotes
      .map((bar: { close?: number | null }) => bar.close)
      .filter((c: number | null | undefined): c is number => c !== null && c !== undefined);

    if (closes.length < 50) return null;

    const price = closes[closes.length - 1];
    const high52 = Math.max(...closes);
    const low52 = Math.min(...closes);
    
    const sma = (arr: number[], n: number) =>
      arr.length >= n ? arr.slice(-n).reduce((a, b) => a + b, 0) / n : null;
    
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, Math.min(200, closes.length));
    const position52w = high52 !== low52 
      ? ((price - low52) / (high52 - low52)) * 100 
      : 50;

    // Calculate 12-1 month momentum (price change from 12 months ago to 1 month ago)
    // Approximately: 252 trading days/year, 21 trading days/month
    let momentum12m1m: number | null = null;
    if (closes.length >= 252) {
      const price12mAgo = closes[closes.length - 252];
      const price1mAgo = closes[closes.length - 21] || closes[closes.length - 1];
      if (price12mAgo > 0) {
        momentum12m1m = ((price1mAgo - price12mAgo) / price12mAgo) * 100;
      }
    } else if (closes.length >= 60) {
      // Fallback for shorter history: use available data minus last month
      const priceStart = closes[0];
      const priceEnd = closes[Math.max(0, closes.length - 21)];
      if (priceStart > 0) {
        momentum12m1m = ((priceEnd - priceStart) / priceStart) * 100;
      }
    }

    // Calculate 90-day volatility (annualized std dev of daily returns)
    let volatility90d: number | null = null;
    const last90 = closes.slice(-90);
    if (last90.length >= 60) {
      const dailyReturns: number[] = [];
      for (let i = 1; i < last90.length; i++) {
        if (last90[i - 1] > 0) {
          dailyReturns.push((last90[i] - last90[i - 1]) / last90[i - 1]);
        }
      }
      if (dailyReturns.length >= 30) {
        const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
        const dailyStdDev = Math.sqrt(variance);
        // Annualize: multiply by sqrt(252)
        volatility90d = dailyStdDev * Math.sqrt(252) * 100;
      }
    }

    return { price, high52, low52, sma50, sma200, position52w, momentum12m1m, volatility90d };
  } catch (error) {
    console.error(`[Chart] ${ticker}: failed -`, error);
    return null;
  }
}

interface FundamentalsData {
  name: string;
  mcapRaw: number;
  mcapM: number;
  pe: number | null;
  forwardPE: number | null;
  pb: number | null;
  roe: number | null;
  roic: number | null; // Return on Invested Capital
  revenueGrowth: number | null;
  revenueGrowthRaw: number | null;
  revenueGrowth3Y: number | null; // 3-year revenue CAGR
  revenueGrowthQoQ: number | null; // Quarter-over-quarter revenue growth
  revenueGrowthYoYCurrent: number | null; // Current YoY growth
  revenueGrowthYoYPrior: number | null; // Prior period YoY growth
  grossMargin: number | null;
  grossMarginPrior: number | null; // For trend analysis
  profitMargin: number | null;
  freeCashflow: number | null;
  priceToFCF: number | null; // P/FCF ratio
  debtToEquity: number | null;
  divYield: number | null;
  targetPrice: number | null;
  analystCount: number;
  insiderBuys: number;
  insiderSells: number;
  insiderTxCount: number;
  insiderPct: number | null;
  instPct: number | null;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  shortPctFloat: number | null;
  beta: number | null;
}

async function getFundamentals(ticker: string): Promise<FundamentalsData | null> {
  await rateLimit();
  
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "defaultKeyStatistics",
        "financialData",
        "price",
        "summaryDetail",
        "earnings",
        "majorHoldersBreakdown",
        "insiderTransactions",
        "recommendationTrend",
        "incomeStatementHistory",
        "incomeStatementHistoryQuarterly",
        "balanceSheetHistory",
      ],
    });

    if (!quote) return null;

    
    const q = quote as any;
    const fin = q.financialData || {};
    const price = q.price || {};
    const summary = q.summaryDetail || {};
    const stats = q.defaultKeyStatistics || {};
    const earnings = q.earnings || {};
    const holders = q.majorHoldersBreakdown || {};
    const insiderTx = q.insiderTransactions?.transactions || [];
    const recoTrend = q.recommendationTrend?.trend || [];
    const incomeHistory = q.incomeStatementHistory?.incomeStatementHistory || [];
    const incomeQuarterly = q.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const balanceHistory = q.balanceSheetHistory?.balanceSheetStatements || [];

    // Revenue growth calculation (basic QoQ from earnings)
    let revenueGrowth: number | null = null;
    let revenueGrowthQoQ: number | null = null;
    const quarterly = earnings.financialsChart?.quarterly;
    if (quarterly && quarterly.length >= 2) {
      const recent = quarterly[quarterly.length - 1]?.revenue?.raw;
      const prev = quarterly[quarterly.length - 2]?.revenue?.raw;
      if (recent && prev && prev > 0) {
        revenueGrowth = ((recent - prev) / prev) * 100;
        revenueGrowthQoQ = revenueGrowth;
      }
    }
    if (revenueGrowth === null && fin.revenueGrowth?.raw != null) {
      revenueGrowth = fin.revenueGrowth.raw * 100;
    }

    // 3-year revenue CAGR from annual income statements
    let revenueGrowth3Y: number | null = null;
    if (incomeHistory.length >= 4) {
      const recentRev = incomeHistory[0]?.totalRevenue?.raw;
      const oldRev = incomeHistory[3]?.totalRevenue?.raw; // 3 years ago
      if (recentRev && oldRev && oldRev > 0) {
        // CAGR formula: (end/start)^(1/n) - 1
        revenueGrowth3Y = (Math.pow(recentRev / oldRev, 1/3) - 1) * 100;
      }
    }

    // YoY revenue growth (current vs prior year) from quarterly data
    let revenueGrowthYoYCurrent: number | null = null;
    let revenueGrowthYoYPrior: number | null = null;
    if (incomeQuarterly.length >= 5) {
      // Current quarter vs same quarter last year
      const currentQ = incomeQuarterly[0]?.totalRevenue?.raw;
      const sameQLY = incomeQuarterly[4]?.totalRevenue?.raw;
      if (currentQ && sameQLY && sameQLY > 0) {
        revenueGrowthYoYCurrent = ((currentQ - sameQLY) / sameQLY) * 100;
      }
      // Prior quarter vs same quarter 2 years ago (for acceleration)
      if (incomeQuarterly.length >= 6) {
        const priorQ = incomeQuarterly[1]?.totalRevenue?.raw;
        const priorQLY = incomeQuarterly[5]?.totalRevenue?.raw;
        if (priorQ && priorQLY && priorQLY > 0) {
          revenueGrowthYoYPrior = ((priorQ - priorQLY) / priorQLY) * 100;
        }
      }
    }

    // Gross margin and trend
    let grossMargin: number | null = fin.grossMargins ?? null;
    let grossMarginPrior: number | null = null;
    if (incomeQuarterly.length >= 2) {
      const gp0 = incomeQuarterly[0]?.grossProfit?.raw;
      const rev0 = incomeQuarterly[0]?.totalRevenue?.raw;
      const gp1 = incomeQuarterly[1]?.grossProfit?.raw;
      const rev1 = incomeQuarterly[1]?.totalRevenue?.raw;
      if (gp0 && rev0 && rev0 > 0) {
        grossMargin = gp0 / rev0;
      }
      if (gp1 && rev1 && rev1 > 0) {
        grossMarginPrior = gp1 / rev1;
      }
    }

    // ROIC calculation: NOPAT / Invested Capital
    // NOPAT ≈ Operating Income * (1 - tax rate), Invested Capital ≈ Total Equity + Total Debt - Cash
    let roic: number | null = null;
    if (incomeHistory.length > 0 && balanceHistory.length > 0) {
      const opIncome = incomeHistory[0]?.operatingIncome?.raw;
      const taxRate = incomeHistory[0]?.incomeTaxExpense?.raw && incomeHistory[0]?.incomeBeforeTax?.raw
        ? incomeHistory[0].incomeTaxExpense.raw / incomeHistory[0].incomeBeforeTax.raw
        : 0.25; // Default 25% tax rate
      const totalEquity = balanceHistory[0]?.totalStockholderEquity?.raw || 0;
      const totalDebt = balanceHistory[0]?.longTermDebt?.raw || 0;
      const cash = balanceHistory[0]?.cash?.raw || 0;
      const investedCapital = totalEquity + totalDebt - cash;
      
      if (opIncome && investedCapital > 0) {
        const nopat = opIncome * (1 - Math.max(0, Math.min(taxRate, 0.5)));
        roic = (nopat / investedCapital) * 100;
      }
    }

    // P/FCF calculation
    let priceToFCF: number | null = null;
    const marketCap = price.marketCap || 0;
    const fcf = fin.freeCashflow;
    if (marketCap > 0 && fcf && fcf > 0) {
      priceToFCF = marketCap / fcf;
    }

    // Insider activity (last 6 months)
    let insiderBuys = 0;
    let insiderSells = 0;
    const sixMonthsAgo = Date.now() / 1000 - 180 * 86400;
    
    for (const tx of insiderTx as any[]) {
      const date = tx.startDate?.raw || 0;
      if (date < sixMonthsAgo) continue;
      const shares = tx.shares?.raw || 0;
      const txType = tx.transactionText || "";
      if (txType.includes("Purchase") || tx.ownership === "D") {
        insiderBuys += shares;
      } else if (txType.includes("Sale")) {
        insiderSells += Math.abs(shares);
      }
    }

    // Analyst recommendations
    const reco = recoTrend[0] || {};

    return {
      name: (price.longName || price.shortName || ticker).substring(0, 40),
      mcapRaw: price.marketCap || 0,
      mcapM: price.marketCap ? Math.round(price.marketCap / 1e6) : 0,
      pe: summary.trailingPE ?? null,
      forwardPE: summary.forwardPE ?? stats.forwardPE ?? null,
      pb: price.priceToBook ?? stats.priceToBook ?? null,
      roe: fin.returnOnEquity ? fin.returnOnEquity * 100 : null,
      roic,
      revenueGrowth,
      revenueGrowthRaw: fin.revenueGrowth ?? null,
      revenueGrowth3Y,
      revenueGrowthQoQ,
      revenueGrowthYoYCurrent,
      revenueGrowthYoYPrior,
      grossMargin,
      grossMarginPrior,
      profitMargin: fin.profitMargins ? fin.profitMargins * 100 : null,
      freeCashflow: fin.freeCashflow ?? null,
      priceToFCF,
      debtToEquity: fin.debtToEquity ?? null,
      divYield: summary.dividendYield ? summary.dividendYield * 100 : null,
      targetPrice: fin.targetMeanPrice ?? null,
      analystCount: fin.numberOfAnalystOpinions || 0,
      insiderBuys,
      insiderSells,
      insiderTxCount: insiderTx.length,
      insiderPct: holders.insidersPercentHeld ? holders.insidersPercentHeld * 100 : null,
      instPct: holders.institutionsPercentHeld ? holders.institutionsPercentHeld * 100 : null,
      strongBuy: reco.strongBuy || 0,
      buy: reco.buy || 0,
      hold: reco.hold || 0,
      sell: reco.sell || 0,
      strongSell: reco.strongSell || 0,
      shortPctFloat: stats.shortPercentOfFloat ?? null,
      beta: stats.beta ?? null,
    };
  } catch (error) {
    console.error(`[Fundamentals] ${ticker}: failed -`, error);
    return null;
  }
}

// ── Scoring Functions ────────────────────────────────────────────────────────

function scoreGrowth(fund: FundamentalsData): ScoreComponent {
  let score = 0;
  const details: string[] = [];

  // Revenue Growth 3Y: 12 pts (>30% = 12, >20% = 9, >10% = 6, >0% = 3)
  if (fund.revenueGrowth3Y != null) {
    if (fund.revenueGrowth3Y > 30) {
      score += 12;
      details.push(`Rev3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    } else if (fund.revenueGrowth3Y > 20) {
      score += 9;
      details.push(`Rev3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    } else if (fund.revenueGrowth3Y > 10) {
      score += 6;
      details.push(`Rev3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    } else if (fund.revenueGrowth3Y > 0) {
      score += 3;
      details.push(`Rev3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    } else {
      details.push(`Rev3Y ${fund.revenueGrowth3Y.toFixed(0)}%`);
    }
  }

  // Revenue Growth QoQ: 10 pts (>15% = 10, >10% = 7, >5% = 4, >0% = 2)
  if (fund.revenueGrowthQoQ != null) {
    if (fund.revenueGrowthQoQ > 15) {
      score += 10;
      details.push(`QoQ+${fund.revenueGrowthQoQ.toFixed(0)}%`);
    } else if (fund.revenueGrowthQoQ > 10) {
      score += 7;
      details.push(`QoQ+${fund.revenueGrowthQoQ.toFixed(0)}%`);
    } else if (fund.revenueGrowthQoQ > 5) {
      score += 4;
      details.push(`QoQ+${fund.revenueGrowthQoQ.toFixed(0)}%`);
    } else if (fund.revenueGrowthQoQ > 0) {
      score += 2;
      details.push(`QoQ+${fund.revenueGrowthQoQ.toFixed(0)}%`);
    } else {
      details.push(`QoQ ${fund.revenueGrowthQoQ.toFixed(0)}%`);
    }
  }

  // Revenue Acceleration: 15 pts (current YoY > prior YoY = 15, same = 7, decelerating = 0)
  if (fund.revenueGrowthYoYCurrent != null && fund.revenueGrowthYoYPrior != null) {
    const diff = fund.revenueGrowthYoYCurrent - fund.revenueGrowthYoYPrior;
    if (diff > 2) { // Accelerating (with small tolerance)
      score += 15;
      details.push("Rev accelerating");
    } else if (diff >= -2) { // Stable
      score += 7;
      details.push("Rev stable");
    } else {
      details.push("Rev decelerating");
    }
  }

  // Earnings Acceleration: 7 pts (forward PE < trailing PE * 0.85 = 7, < 0.95 = 4)
  if (fund.forwardPE && fund.pe && fund.pe > 0 && fund.forwardPE > 0) {
    const ratio = fund.forwardPE / fund.pe;
    if (ratio < 0.85) {
      score += 7;
      details.push("Earnings accelerating");
    } else if (ratio < 0.95) {
      score += 4;
      details.push("Earnings growing");
    }
  }

  // Gross Margin Trend: 6 pts (improving = 6, stable = 3, declining = 0)
  if (fund.grossMargin != null && fund.grossMarginPrior != null) {
    const diff = fund.grossMargin - fund.grossMarginPrior;
    if (diff > 0.01) { // Improving by >1%
      score += 6;
      details.push(`GM↑ ${(fund.grossMargin * 100).toFixed(0)}%`);
    } else if (diff >= -0.01) { // Stable
      score += 3;
      details.push(`GM ${(fund.grossMargin * 100).toFixed(0)}%`);
    } else {
      details.push(`GM↓ ${(fund.grossMargin * 100).toFixed(0)}%`);
    }
  } else if (fund.grossMargin != null) {
    // No prior data, give partial credit for having margin data
    details.push(`GM ${(fund.grossMargin * 100).toFixed(0)}%`);
  }

  return { score: Math.min(score, 50), max: 50, details };
}

function scoreFinancial(fund: FundamentalsData): ScoreComponent {
  let score = 0;
  const details: string[] = [];

  // ROIC: 15 pts (>20% = 15, >15% = 11, >10% = 7, >5% = 3)
  if (fund.roic != null) {
    if (fund.roic > 20) {
      score += 15;
      details.push(`ROIC ${fund.roic.toFixed(0)}%`);
    } else if (fund.roic > 15) {
      score += 11;
      details.push(`ROIC ${fund.roic.toFixed(0)}%`);
    } else if (fund.roic > 10) {
      score += 7;
      details.push(`ROIC ${fund.roic.toFixed(0)}%`);
    } else if (fund.roic > 5) {
      score += 3;
      details.push(`ROIC ${fund.roic.toFixed(0)}%`);
    } else {
      details.push(`ROIC ${fund.roic.toFixed(0)}%`);
    }
  }

  // P/FCF: 8 pts (<10 = 8, <15 = 6, <20 = 4, <30 = 2)
  if (fund.priceToFCF != null && fund.priceToFCF > 0) {
    if (fund.priceToFCF < 10) {
      score += 8;
      details.push(`P/FCF ${fund.priceToFCF.toFixed(1)}`);
    } else if (fund.priceToFCF < 15) {
      score += 6;
      details.push(`P/FCF ${fund.priceToFCF.toFixed(1)}`);
    } else if (fund.priceToFCF < 20) {
      score += 4;
      details.push(`P/FCF ${fund.priceToFCF.toFixed(1)}`);
    } else if (fund.priceToFCF < 30) {
      score += 2;
      details.push(`P/FCF ${fund.priceToFCF.toFixed(1)}`);
    } else {
      details.push(`P/FCF ${fund.priceToFCF.toFixed(1)}`);
    }
  }

  // FCF Positive: 4 pts (yes = 4, no = 0)
  if (fund.freeCashflow != null && fund.freeCashflow > 0) {
    score += 4;
    details.push("FCF+");
  } else if (fund.freeCashflow != null) {
    details.push("FCF-");
  }

  // Debt/Equity: 3 pts (<30% = 3, <50% = 2, <100% = 1)
  if (fund.debtToEquity != null) {
    if (fund.debtToEquity < 30) {
      score += 3;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    } else if (fund.debtToEquity < 50) {
      score += 2;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    } else if (fund.debtToEquity < 100) {
      score += 1;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    } else {
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    }
  }

  return { score: Math.min(score, 30), max: 30, details };
}

function scoreInsider(_fund: FundamentalsData): ScoreComponent {
  // Insider scoring removed from total - returns empty score
  return { score: 0, max: 0, details: [] };
}

function scoreTechnical(chart: ChartData | null): ScoreComponent {
  let score = 0;
  const details: string[] = [];

  if (!chart) return { score: 0, max: 20, details: ["No chart data"] };

  // 12-1 Month Momentum: 12 pts (price change excluding last month: >30% = 12, >20% = 9, >10% = 6, >0% = 3)
  if (chart.momentum12m1m != null) {
    if (chart.momentum12m1m > 30) {
      score += 12;
      details.push(`Mom+${chart.momentum12m1m.toFixed(0)}%`);
    } else if (chart.momentum12m1m > 20) {
      score += 9;
      details.push(`Mom+${chart.momentum12m1m.toFixed(0)}%`);
    } else if (chart.momentum12m1m > 10) {
      score += 6;
      details.push(`Mom+${chart.momentum12m1m.toFixed(0)}%`);
    } else if (chart.momentum12m1m > 0) {
      score += 3;
      details.push(`Mom+${chart.momentum12m1m.toFixed(0)}%`);
    } else {
      details.push(`Mom ${chart.momentum12m1m.toFixed(0)}%`);
    }
  }

  // Volatility-Adjusted Momentum: 8 pts (momentum / 90-day volatility: >2 = 8, >1.5 = 6, >1 = 4, >0.5 = 2)
  if (chart.momentum12m1m != null && chart.volatility90d != null && chart.volatility90d > 0) {
    const volAdjMom = chart.momentum12m1m / chart.volatility90d;
    if (volAdjMom > 2) {
      score += 8;
      details.push(`VAM ${volAdjMom.toFixed(1)}`);
    } else if (volAdjMom > 1.5) {
      score += 6;
      details.push(`VAM ${volAdjMom.toFixed(1)}`);
    } else if (volAdjMom > 1) {
      score += 4;
      details.push(`VAM ${volAdjMom.toFixed(1)}`);
    } else if (volAdjMom > 0.5) {
      score += 2;
      details.push(`VAM ${volAdjMom.toFixed(1)}`);
    } else {
      details.push(`VAM ${volAdjMom.toFixed(1)}`);
    }
  } else if (chart.volatility90d != null) {
    details.push(`Vol ${chart.volatility90d.toFixed(0)}%`);
  }

  return { score: Math.min(score, 20), max: 20, details };
}

function scoreAnalyst(fund: FundamentalsData, chart: ChartData | null): ScoreComponent {
  let score = 0;
  const details: string[] = [];

  const total = fund.strongBuy + fund.buy + fund.hold + fund.sell + fund.strongSell;
  if (total > 0) {
    const buyRatio = (fund.strongBuy + fund.buy) / total;
    if (buyRatio >= 0.8) {
      score += 5;
      details.push(`${(buyRatio * 100).toFixed(0)}% Buy`);
    } else if (buyRatio >= 0.6) {
      score += 3;
      details.push(`${(buyRatio * 100).toFixed(0)}% Buy`);
    } else {
      details.push(`${(buyRatio * 100).toFixed(0)}% Buy`);
    }

    // Coverage count bonus (0-2 pts)
    if (total >= 10) score += 2;
    else if (total >= 5) score += 1;

    details.push(`${total} analysts`);
  } else {
    if (fund.analystCount <= 2) {
      score += 1;
      details.push("Undiscovered");
    } else {
      details.push("No coverage");
    }
  }

  // Analyst target upside > 20% (0-3 pts)
  if (fund.targetPrice && chart && fund.targetPrice > chart.price * 1.2) {
    const upside = ((fund.targetPrice / chart.price - 1) * 100).toFixed(0);
    score += 3;
    details.push(`${upside}% upside to target`);
  }

  return { score: Math.min(score, 10), max: 10, details };
}

function calculateRisk(chart: ChartData | null, fund: FundamentalsData, market: "US" | "SGX" | "HK" | "JP"): RiskAnalysis {
  let penalty = 0;
  const flags: string[] = [];

  // NEAR_HIGH: price in top 25% of 52-week range
  if (chart && chart.position52w >= 75) {
    penalty -= 5;
    flags.push(`NEAR_HIGH (${chart.position52w.toFixed(0)}%)`);
  }

  // SHRINKING: revenue declining >10%
  if (fund.revenueGrowth != null && fund.revenueGrowth < -10) {
    penalty -= 5;
    flags.push(`SHRINKING (Rev ${fund.revenueGrowth.toFixed(0)}%)`);
  }

  // Short interest penalty (primarily US stocks)
  if (fund.shortPctFloat != null) {
    if (fund.shortPctFloat >= 0.3) {
      penalty -= 10;
      flags.push(`Short ${(fund.shortPctFloat * 100).toFixed(0)}%`);
    } else if (fund.shortPctFloat >= 0.2) {
      penalty -= 5;
      flags.push(`Short ${(fund.shortPctFloat * 100).toFixed(0)}%`);
    }
  }

  // Beta > 3 penalty
  if (fund.beta != null && fund.beta > 3) {
    penalty -= 3;
    flags.push(`Beta ${fund.beta.toFixed(1)}`);
  }

  return { penalty, flags };
}

function classifyStock(totalScore: number): { tier: string; tierColor: string } {
  if (totalScore >= 70) return { tier: "HIGH CONVICTION", tierColor: "green" };
  if (totalScore >= 50) return { tier: "SPECULATIVE", tierColor: "yellow" };
  if (totalScore >= 35) return { tier: "WATCHLIST", tierColor: "blue" };
  return { tier: "AVOID", tierColor: "red" };
}

function getRiskTier(fund: FundamentalsData, market: "US" | "SGX" | "HK" | "JP"): string {
  if (market === "SGX" || market === "HK" || market === "JP") {
    const mcapM = fund.mcapM || 0;
    const de = fund.debtToEquity || 0;
    if (mcapM < 50 || de > 200) return "TIER 3";
    if (mcapM < 200 || de > 100) return "TIER 2";
    return "TIER 1";
  } else {
    const shortPct = fund.shortPctFloat || 0;
    const beta = fund.beta || 1;
    if (shortPct > 0.2 || beta > 3) return "TIER 3";
    if (shortPct > 0.1 || beta > 2) return "TIER 2";
    return "TIER 1";
  }
}

function getMarket(ticker: string): "US" | "SGX" | "HK" | "JP" {
  if (ticker.endsWith(".SI")) return "SGX";
  if (ticker.endsWith(".HK")) return "HK";
  if (ticker.endsWith(".T")) return "JP";
  return "US";
}

// ── Database ─────────────────────────────────────────────────────────────────

async function saveToDatabase(results: ScanResult[], summary: ScanSummary): Promise<void> {
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const dbToken = process.env.TURSO_AUTH_TOKEN;

  if (!dbUrl) {
    throw new Error("TURSO_DATABASE_URL is required");
  }

  const client = createClient({
    url: dbUrl,
    authToken: dbToken,
  });

  const now = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO stock_scans (scan_type, scanned_at, results, summary, stock_count) 
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      "unified",
      now,
      JSON.stringify(results),
      JSON.stringify(summary),
      results.length,
    ],
  });

  console.log(`[DB] Saved ${results.length} results to database`);
}

// ── Main Scanner ─────────────────────────────────────────────────────────────

async function runScanner(): Promise<void> {
  console.log("=".repeat(80));
  console.log(" GITHUB ACTIONS STOCK SCANNER");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("=".repeat(80));

  // Determine which markets to scan
  const marketsEnv = process.env.SCAN_MARKETS || "US,SGX";
  const marketsToScan = marketsEnv.split(",").map((m) => m.trim().toUpperCase());
  
  // Initialize database client
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const dbToken = process.env.TURSO_AUTH_TOKEN;
  const dbClient = createClient({ url: dbUrl!, authToken: dbToken });

  // Try to fetch from database first, fall back to static lists
  let tickerSources = await fetchTickersFromDB(dbClient, marketsToScan);
  
  if (!tickerSources) {
    // Fallback: use static lists + screeners
    console.log("Using fallback ticker lists...\n");
    tickerSources = new Map<string, { market: string; source: "curated" | "discovered" }>();
    
    if (marketsToScan.includes("US")) {
      // Dynamically fetch from screeners + add curated
      const usTickers = await fetchScreenerTickers(100);
      usTickers.forEach(t => {
        tickerSources!.set(t, {
          market: "US",
          source: US_CURATED.includes(t) ? "curated" : "discovered",
        });
      });
    }
    
    if (marketsToScan.includes("SGX")) {
      const sgxSet = new Set(SGX_TICKERS);
      sgxSet.forEach(t => tickerSources!.set(t, { market: "SGX", source: "curated" }));
      console.log(`SGX: ${sgxSet.size} tickers`);
    }
    
    if (marketsToScan.includes("HK")) {
      const hkSet = new Set(HK_TICKERS);
      hkSet.forEach(t => tickerSources!.set(t, { market: "HK", source: "curated" }));
      console.log(`HK: ${hkSet.size} tickers`);
    }
    
    if (marketsToScan.includes("JP")) {
      const jpSet = new Set(JP_TICKERS);
      jpSet.forEach(t => tickerSources!.set(t, { market: "JP", source: "curated" }));
      console.log(`JP: ${jpSet.size} tickers`);
    }
    console.log("");
  }
  
  const allTickers = Array.from(tickerSources.keys());
  console.log(`Markets: ${marketsToScan.join(", ")}`);
  console.log(`Universe: ${allTickers.length} tickers\n`);

  const results: ScanResult[] = [];
  let done = 0;
  const total = allTickers.length;

  for (const ticker of allTickers) {
    done++;
    const tickerInfo = tickerSources.get(ticker);
    const market = (tickerInfo?.market || getMarket(ticker)) as "US" | "SGX" | "HK" | "JP";
    const source = tickerInfo?.source || "discovered";
    
    try {
      const [chart, fund] = await Promise.all([
        getChartData(ticker),
        getFundamentals(ticker),
      ]);

      if (!chart || !fund) {
        console.log(`[${done}/${total}] ✗ ${ticker} (missing data)`);
        await delay(200);
        continue;
      }

      // Score each category
      const growth = scoreGrowth(fund);
      const financial = scoreFinancial(fund);
      const insider = scoreInsider(fund);
      const technical = scoreTechnical(chart);
      const analyst = scoreAnalyst(fund, chart);
      const risk = calculateRisk(chart, fund, market);

      const rawScore =
        growth.score +
        financial.score +
        technical.score +
        risk.penalty;
      // Note: insider.score and analyst.score excluded (removed from scoring)
      const totalScore = Math.max(0, rawScore);

      const { tier, tierColor } = classifyStock(totalScore);
      const riskTier = getRiskTier(fund, market);

      const tickerClean = ticker.replace(".SI", "").replace(".HK", "");

      results.push({
        rank: 0,
        ticker: tickerClean,
        name: fund.name,
        price: chart.price,
        mcapB: fund.mcapRaw ? (fund.mcapRaw / 1e9).toFixed(1) : "N/A",
        totalScore,
        tier,
        tierColor,
        riskTier,
        market,
        growth,
        financial,
        insider,
        technical,
        analyst,
        risk,
        source,
        revGrowth: fund.revenueGrowthRaw,
        grossMargin: fund.grossMargin,
      });

      console.log(
        `[${done}/${total}] ${tickerClean.padEnd(8)} [${market}] Score: ${totalScore} [${tier}]`
      );
    } catch (error) {
      console.log(`[${done}/${total}] ✗ ${ticker} (${error})`);
    }

    await delay(100);
  }

  // Sort by score and assign ranks
  results.sort((a, b) => b.totalScore - a.totalScore);
  results.forEach((r, idx) => (r.rank = idx + 1));

  // Build summary
  const summary: ScanSummary = {
    universeSize: allTickers.length,
    scannedCount: results.length,
    highConviction: results.filter((r) => r.totalScore >= 70).length,
    speculative: results.filter((r) => r.totalScore >= 50 && r.totalScore < 70).length,
    watchlist: results.filter((r) => r.totalScore >= 35 && r.totalScore < 50).length,
    avoid: results.filter((r) => r.totalScore < 35).length,
    usCount: results.filter((r) => r.market === "US").length,
    sgxCount: results.filter((r) => r.market === "SGX").length,
    hkCount: results.filter((r) => r.market === "HK").length,
    jpCount: results.filter((r) => r.market === "JP").length,
  };

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log(" SUMMARY");
  console.log("=".repeat(80));
  console.log(`Scanned: ${summary.scannedCount}/${summary.universeSize}`);
  console.log(`US: ${summary.usCount} | SGX: ${summary.sgxCount} | HK: ${summary.hkCount} | JP: ${summary.jpCount}`);
  console.log(`HIGH CONVICTION: ${summary.highConviction}`);
  console.log(`SPECULATIVE: ${summary.speculative}`);
  console.log(`WATCHLIST: ${summary.watchlist}`);
  console.log(`AVOID: ${summary.avoid}`);

  // Top 10
  console.log("\n-- Top 10 --");
  results.slice(0, 10).forEach((r, i) => {
    console.log(
      `${i + 1}. ${r.ticker.padEnd(8)} [${r.market}] Score: ${r.totalScore} - ${r.tier}`
    );
  });

  // Save to database
  console.log("\n" + "=".repeat(80));
  await saveToDatabase(results, summary);
  console.log("=".repeat(80));
  console.log(" SCAN COMPLETE");
  console.log("=".repeat(80));
}

// ── Entry Point ──────────────────────────────────────────────────────────────

runScanner().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
