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

// Comprehensive China A-shares tickers (~60 major stocks from SSE and SZSE)
const CN_TICKERS = [
  // ── Shanghai Stock Exchange (.SS) ──
  "600519.SS", "601318.SS", "600036.SS", "600276.SS", "601012.SS", "600900.SS",
  "600309.SS", "600887.SS", "601888.SS", "600030.SS", "601166.SS", "600000.SS",
  "600050.SS", "601398.SS", "601288.SS", "601939.SS", "601988.SS", "600028.SS",
  "601857.SS", "600585.SS", "600104.SS", "600690.SS", "601668.SS", "600703.SS",
  "601601.SS", "600438.SS", "600089.SS", "601225.SS", "600196.SS", "601628.SS",
  
  // ── Shenzhen Stock Exchange (.SZ) ──
  "000858.SZ", "000333.SZ", "000651.SZ", "002415.SZ", "300750.SZ", "002594.SZ",
  "000001.SZ", "000002.SZ", "002304.SZ", "300059.SZ", "002352.SZ", "000725.SZ",
  "002475.SZ", "300760.SZ", "002714.SZ", "000538.SZ", "002027.SZ", "300124.SZ",
  "002241.SZ", "300015.SZ", "000568.SZ", "002230.SZ", "000063.SZ", "002142.SZ",
  "300033.SZ", "002601.SZ", "300014.SZ", "002032.SZ", "300274.SZ", "002050.SZ",
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
  market: "US" | "SGX" | "HK" | "JP" | "CN";
  growth: ScoreComponent;
  financial: ScoreComponent;
  technical: ScoreComponent;
  risk: RiskAnalysis;
  revGrowth: number | null;
  grossMargin: number | null;
  source: "curated" | "discovered";
  // Multi-mode scores (0-100 each)
  quantScore?: number;
  valueScore?: number;
  growthScore?: number;
  combinedScore?: number;
  quantBreakdown?: ScoreComponent;
  valueBreakdown?: ScoreComponent;
  growthBreakdown?: ScoreComponent;
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
  cnCount: number;
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
  position52w: number;
  // Momentum fields
  momentum12m1m: number | null; // 12-1 month momentum (excluding last month)
  volatility90d: number | null; // 90-day volatility (std dev of daily returns)
  // Growth mode fields
  return6m: number | null; // 6-month return
  return3m: number | null; // 3-month return
  // Quant mode fields
  sma200: number | null; // 200-day simple moving average
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

    // Calculate 6-month and 3-month returns for growth mode
    let return6m: number | null = null;
    let return3m: number | null = null;
    
    // 6-month return (~126 trading days)
    if (closes.length >= 126) {
      const price6mAgo = closes[closes.length - 126];
      if (price6mAgo > 0) {
        return6m = ((price - price6mAgo) / price6mAgo) * 100;
      }
    }
    
    // 3-month return (~63 trading days)
    if (closes.length >= 63) {
      const price3mAgo = closes[closes.length - 63];
      if (price3mAgo > 0) {
        return3m = ((price - price3mAgo) / price3mAgo) * 100;
      }
    }

    // 200-day simple moving average
    let sma200: number | null = null;
    if (closes.length >= 200) {
      const last200 = closes.slice(-200);
      sma200 = last200.reduce((a, b) => a + b, 0) / 200;
    }

    return { price, high52, low52, position52w, momentum12m1m, volatility90d, return6m, return3m, sma200 };
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
  priceToSales: number | null; // P/S ratio for growth mode
  enterpriseToEbitda: number | null; // EV/EBITDA for quant mode
  dividendYield: number | null; // Dividend yield for quant mode
  targetPrice: number | null;
  analystCount: number;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  shortPctFloat: number | null;
  beta: number | null;
  // Value mode fields
  totalRevenue: number | null;
  totalDebt: number | null;
  interestExpense: number | null;
  ebit: number | null;
  payoutRatio: number | null;
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
    const recoTrend = q.recommendationTrend?.trend || [];
    const incomeHistory = q.incomeStatementHistory?.incomeStatementHistory || [];
    const incomeQuarterly = q.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const balanceHistory = q.balanceSheetHistory?.balanceSheetStatements || [];

    // YoY Revenue growth from Yahoo Finance financialData (primary source)
    // Note: yahoo-finance2 returns this as a plain number (ratio), not an object
    let revenueGrowth: number | null = null;
    if (typeof fin.revenueGrowth === 'number') {
      revenueGrowth = fin.revenueGrowth * 100; // Convert ratio to percentage
    }
    
    // QoQ Revenue growth from earnings quarterly data
    let revenueGrowthQoQ: number | null = null;
    const quarterly = earnings.financialsChart?.quarterly;
    if (quarterly && quarterly.length >= 2) {
      const recent = quarterly[quarterly.length - 1]?.revenue?.raw;
      const prev = quarterly[quarterly.length - 2]?.revenue?.raw;
      if (recent && prev && prev > 0) {
        revenueGrowthQoQ = ((recent - prev) / prev) * 100;
      }
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
      const incomeBeforeTax = incomeHistory[0]?.incomeBeforeTax?.raw;
      const taxExpense = incomeHistory[0]?.incomeTaxExpense?.raw;
      // Only calculate tax rate if income before tax is positive (avoid division issues for loss-making companies)
      const taxRate = taxExpense && incomeBeforeTax && incomeBeforeTax > 0
        ? taxExpense / incomeBeforeTax
        : 0.25; // Default 25% tax rate
      const totalEquity = balanceHistory[0]?.totalStockholderEquity?.raw || 0;
      // Include both long-term and short-term debt in invested capital
      const longTermDebt = balanceHistory[0]?.longTermDebt?.raw || 0;
      const shortTermDebt = balanceHistory[0]?.shortLongTermDebt?.raw || balanceHistory[0]?.shortTermDebt?.raw || 0;
      const totalDebt = longTermDebt + shortTermDebt;
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
      revenueGrowthRaw: typeof fin.revenueGrowth === 'number' ? fin.revenueGrowth : null,
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
      priceToSales: summary.priceToSalesTrailing12Months ?? null,
      enterpriseToEbitda: stats.enterpriseToEbitda ?? null,
      dividendYield: summary.dividendYield ?? null,
      targetPrice: fin.targetMeanPrice ?? null,
      analystCount: fin.numberOfAnalystOpinions || 0,
      strongBuy: reco.strongBuy || 0,
      buy: reco.buy || 0,
      hold: reco.hold || 0,
      sell: reco.sell || 0,
      strongSell: reco.strongSell || 0,
      shortPctFloat: stats.shortPercentOfFloat ?? null,
      beta: stats.beta ?? null,
      // Value mode fields
      totalRevenue: incomeHistory[0]?.totalRevenue?.raw ?? null,
      totalDebt: (() => {
        const ltd = balanceHistory[0]?.longTermDebt?.raw || 0;
        const std = balanceHistory[0]?.shortLongTermDebt?.raw || balanceHistory[0]?.shortTermDebt?.raw || 0;
        return ltd + std > 0 ? ltd + std : null;
      })(),
      interestExpense: incomeHistory[0]?.interestExpense?.raw ?? null,
      ebit: incomeHistory[0]?.ebit?.raw ?? incomeHistory[0]?.operatingIncome?.raw ?? null,
      payoutRatio: summary.payoutRatio ?? null,
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
  let usedYoYFallback = false;

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
  } else if (fund.revenueGrowth != null) {
    // FALLBACK: Use YoY revenue growth from Yahoo Finance when 3Y unavailable
    // fund.revenueGrowth is already in percentage format (e.g., 500.8 = 500.8%)
    usedYoYFallback = true;
    if (fund.revenueGrowth > 100) {
      score += 12;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 50) {
      score += 10;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 30) {
      score += 8;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 20) {
      score += 6;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 10) {
      score += 4;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 0) {
      score += 2;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else {
      details.push(`YoY ${fund.revenueGrowth.toFixed(0)}%`);
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
  } else if (fund.revenueGrowth != null && fund.revenueGrowth > 30) {
    // FALLBACK: Estimate QoQ from strong YoY when QoQ unavailable (regardless of 3Y availability)
    const impliedQoQ = fund.revenueGrowth / 4;
    if (impliedQoQ > 15) {
      score += 6; // Reduced credit for estimate
      details.push(`~QoQ+${impliedQoQ.toFixed(0)}%`);
    } else if (impliedQoQ > 10) {
      score += 4;
      details.push(`~QoQ+${impliedQoQ.toFixed(0)}%`);
    } else if (impliedQoQ > 5) {
      score += 2;
      details.push(`~QoQ+${impliedQoQ.toFixed(0)}%`);
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
  } else if (usedYoYFallback && fund.revenueGrowth != null && fund.revenueGrowth > 50) {
    // FALLBACK: Give partial credit for exceptional YoY growth (assumes acceleration)
    score += 8;
    details.push("Hypergrowth");
  }

  // Earnings Acceleration: 7 pts
  // For profitable companies: forward PE < trailing PE
  // For unprofitable companies: use gross margin + revenue growth as proxy
  if (fund.forwardPE && fund.pe && fund.pe > 0 && fund.forwardPE > 0) {
    const ratio = fund.forwardPE / fund.pe;
    if (ratio < 0.85) {
      score += 7;
      details.push("Earnings accelerating");
    } else if (ratio < 0.95) {
      score += 4;
      details.push("Earnings growing");
    }
  } else if (fund.pe == null || fund.pe <= 0) {
    // FALLBACK: Unprofitable company - use gross margin + revenue growth as proxy
    const gm = fund.grossMargin ?? 0;
    const revGrowth = fund.revenueGrowth ?? 0;
    if (gm >= 0.60 && revGrowth >= 50) {
      score += 5;
      details.push("Pre-profit hypergrowth");
    } else if (gm >= 0.40 && revGrowth >= 30) {
      score += 3;
      details.push("Pre-profit growth");
    }
  }

  // Gross Margin Trend: 6 pts (improving = 6, stable = 3, declining = 0)
  // Also give credit for high absolute gross margin when trend unavailable
  if (fund.grossMargin != null && fund.grossMarginPrior != null) {
    const diff = fund.grossMargin - fund.grossMarginPrior;
    if (diff >= 0.01) { // Improving by >=1%
      score += 6;
      details.push(`GM↑ ${(fund.grossMargin * 100).toFixed(0)}%`);
    } else if (diff >= -0.01) { // Stable
      score += 3;
      details.push(`GM ${(fund.grossMargin * 100).toFixed(0)}%`);
    } else {
      details.push(`GM↓ ${(fund.grossMargin * 100).toFixed(0)}%`);
    }
  } else if (fund.grossMargin != null) {
    // FALLBACK: Score based on absolute gross margin level
    if (fund.grossMargin >= 0.70) {
      score += 6;
      details.push(`GM ${(fund.grossMargin * 100).toFixed(0)}%`);
    } else if (fund.grossMargin >= 0.50) {
      score += 4;
      details.push(`GM ${(fund.grossMargin * 100).toFixed(0)}%`);
    } else if (fund.grossMargin >= 0.35) {
      score += 2;
      details.push(`GM ${(fund.grossMargin * 100).toFixed(0)}%`);
    } else {
      details.push(`GM ${(fund.grossMargin * 100).toFixed(0)}%`);
    }
  }

  return { score: Math.min(score, 50), max: 50, details };
}

function scoreFinancial(fund: FundamentalsData): ScoreComponent {
  let score = 0;
  const details: string[] = [];

  // ROIC: 10 pts (>20% = 10, >15% = 7, >10% = 4, >5% = 2)
  if (fund.roic != null) {
    if (fund.roic > 20) {
      score += 10;
      details.push(`ROIC ${fund.roic.toFixed(0)}%`);
    } else if (fund.roic > 15) {
      score += 7;
      details.push(`ROIC ${fund.roic.toFixed(0)}%`);
    } else if (fund.roic > 10) {
      score += 4;
      details.push(`ROIC ${fund.roic.toFixed(0)}%`);
    } else if (fund.roic > 5) {
      score += 2;
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

/**
 * Growth Mode Scoring (100 pts max + 5 bonus)
 * Optimized for high-growth companies with revenue acceleration
 */
function scoreGrowthMode(fund: FundamentalsData, chart: ChartData | null): ScoreComponent {
  let score = 0;
  const details: string[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // REVENUE GROWTH: 40 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // 3Y CAGR: 15 pts
  if (fund.revenueGrowth3Y != null) {
    if (fund.revenueGrowth3Y > 100) {
      score += 15;
      details.push(`3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    } else if (fund.revenueGrowth3Y > 50) {
      score += 11;
      details.push(`3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    } else if (fund.revenueGrowth3Y > 35) {
      score += 9;
      details.push(`3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    } else if (fund.revenueGrowth3Y > 25) {
      score += 7;
      details.push(`3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    } else if (fund.revenueGrowth3Y > 15) {
      score += 5;
      details.push(`3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    } else if (fund.revenueGrowth3Y > 10) {
      score += 3;
      details.push(`3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    } else {
      details.push(`3Y+${fund.revenueGrowth3Y.toFixed(0)}%`);
    }
  }

  // YoY Growth: 15 pts
  if (fund.revenueGrowth != null) {
    if (fund.revenueGrowth > 150) {
      score += 15;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 100) {
      score += 13;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 75) {
      score += 11;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 50) {
      score += 9;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 35) {
      score += 7;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 20) {
      score += 5;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 10) {
      score += 3;
      details.push(`YoY+${fund.revenueGrowth.toFixed(0)}%`);
    } else {
      details.push(`YoY ${fund.revenueGrowth.toFixed(0)}%`);
    }
  }

  // QoQ Growth: 10 pts
  if (fund.revenueGrowthQoQ != null) {
    if (fund.revenueGrowthQoQ > 30) {
      score += 10;
      details.push(`QoQ+${fund.revenueGrowthQoQ.toFixed(0)}%`);
    } else if (fund.revenueGrowthQoQ > 20) {
      score += 8;
      details.push(`QoQ+${fund.revenueGrowthQoQ.toFixed(0)}%`);
    } else if (fund.revenueGrowthQoQ > 15) {
      score += 6;
      details.push(`QoQ+${fund.revenueGrowthQoQ.toFixed(0)}%`);
    } else if (fund.revenueGrowthQoQ > 10) {
      score += 4;
      details.push(`QoQ+${fund.revenueGrowthQoQ.toFixed(0)}%`);
    } else if (fund.revenueGrowthQoQ > 5) {
      score += 2;
      details.push(`QoQ+${fund.revenueGrowthQoQ.toFixed(0)}%`);
    } else {
      details.push(`QoQ ${fund.revenueGrowthQoQ.toFixed(0)}%`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GROWTH DURABILITY: 15 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // Acceleration: 8 pts (compare current YoY vs prior YoY)
  let isAccelerating = false;
  if (fund.revenueGrowthYoYCurrent != null && fund.revenueGrowthYoYPrior != null) {
    const diff = fund.revenueGrowthYoYCurrent - fund.revenueGrowthYoYPrior;
    if (diff > 10) {
      score += 8;
      isAccelerating = true;
      details.push(`Accel+${diff.toFixed(0)}pp`);
    } else if (diff > 5) {
      score += 6;
      isAccelerating = true;
      details.push(`Accel+${diff.toFixed(0)}pp`);
    } else if (diff > 0) {
      score += 4;
      isAccelerating = true;
      details.push(`Accel+${diff.toFixed(0)}pp`);
    } else if (diff > -5) {
      score += 2;
      details.push(`Decel${diff.toFixed(0)}pp`);
    } else {
      details.push(`Decel${diff.toFixed(0)}pp`);
    }
  }

  // Consistency: 7 pts (4/4 quarters positive)
  if (fund.revenueGrowthQoQ != null && fund.revenueGrowthQoQ > 0) {
    score += 7;
    details.push("Consistent");
  } else if (fund.revenueGrowth != null && fund.revenueGrowth > 20) {
    // Fallback: estimate from strong YoY
    score += 4;
    details.push("~Consistent");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCALABILITY: 15 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // Gross Margin Level: 10 pts
  const gm = fund.grossMargin ?? 0;
  if (gm > 0.70) {
    score += 10;
    details.push(`GM ${(gm * 100).toFixed(0)}%`);
  } else if (gm > 0.60) {
    score += 8;
    details.push(`GM ${(gm * 100).toFixed(0)}%`);
  } else if (gm > 0.50) {
    score += 6;
    details.push(`GM ${(gm * 100).toFixed(0)}%`);
  } else if (gm > 0.40) {
    score += 4;
    details.push(`GM ${(gm * 100).toFixed(0)}%`);
  } else if (gm > 0.30) {
    score += 2;
    details.push(`GM ${(gm * 100).toFixed(0)}%`);
  } else if (gm > 0) {
    details.push(`GM ${(gm * 100).toFixed(0)}%`);
  }

  // GM Trend: 5 pts
  if (fund.grossMargin != null && fund.grossMarginPrior != null) {
    const gmDiff = (fund.grossMargin - fund.grossMarginPrior) * 100; // in percentage points
    if (gmDiff > 3) {
      score += 5;
      details.push(`GM↑${gmDiff.toFixed(0)}pp`);
    } else if (gmDiff > 1) {
      score += 4;
      details.push(`GM↑${gmDiff.toFixed(1)}pp`);
    } else if (gmDiff >= -1) {
      score += 3;
      details.push("GM→");
    } else {
      details.push(`GM↓${gmDiff.toFixed(0)}pp`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOMENTUM: 15 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // 6M Return: 8 pts
  if (chart?.return6m != null) {
    if (chart.return6m > 50) {
      score += 8;
      details.push(`6M+${chart.return6m.toFixed(0)}%`);
    } else if (chart.return6m > 30) {
      score += 7;
      details.push(`6M+${chart.return6m.toFixed(0)}%`);
    } else if (chart.return6m > 15) {
      score += 5;
      details.push(`6M+${chart.return6m.toFixed(0)}%`);
    } else if (chart.return6m > 0) {
      score += 3;
      details.push(`6M+${chart.return6m.toFixed(0)}%`);
    } else if (chart.return6m > -15) {
      score += 1;
      details.push(`6M ${chart.return6m.toFixed(0)}%`);
    } else {
      details.push(`6M ${chart.return6m.toFixed(0)}%`);
    }
  }

  // 3M Return: 7 pts
  if (chart?.return3m != null) {
    if (chart.return3m > 25) {
      score += 7;
      details.push(`3M+${chart.return3m.toFixed(0)}%`);
    } else if (chart.return3m > 15) {
      score += 5;
      details.push(`3M+${chart.return3m.toFixed(0)}%`);
    } else if (chart.return3m > 5) {
      score += 4;
      details.push(`3M+${chart.return3m.toFixed(0)}%`);
    } else if (chart.return3m > 0) {
      score += 2;
      details.push(`3M+${chart.return3m.toFixed(0)}%`);
    } else if (chart.return3m > -10) {
      score += 1;
      details.push(`3M ${chart.return3m.toFixed(0)}%`);
    } else {
      details.push(`3M ${chart.return3m.toFixed(0)}%`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAM PROXY: 15 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // P/S-to-Growth Ratio: 10 pts
  // Ratio = P/S / (revenueGrowth/100)
  // Lower is better (cheap relative to growth)
  if (fund.priceToSales != null && fund.revenueGrowth != null && fund.revenueGrowth > 0) {
    const psToGrowth = fund.priceToSales / (fund.revenueGrowth / 100);
    if (psToGrowth < 0.1) {
      score += 10;
      details.push(`PEG/S ${psToGrowth.toFixed(2)}`);
    } else if (psToGrowth < 0.2) {
      score += 8;
      details.push(`PEG/S ${psToGrowth.toFixed(2)}`);
    } else if (psToGrowth < 0.3) {
      score += 6;
      details.push(`PEG/S ${psToGrowth.toFixed(2)}`);
    } else if (psToGrowth < 0.5) {
      score += 4;
      details.push(`PEG/S ${psToGrowth.toFixed(2)}`);
    } else if (psToGrowth < 1) {
      score += 2;
      details.push(`PEG/S ${psToGrowth.toFixed(2)}`);
    } else {
      details.push(`PEG/S ${psToGrowth.toFixed(2)}`);
    }
  }

  // Market Cap Sweet Spot: 5 pts
  const mcapM = fund.mcapM || 0;
  if (mcapM >= 500 && mcapM <= 5000) {
    score += 5;
    details.push("MCap sweet");
  } else if (mcapM > 5000 && mcapM <= 20000) {
    score += 4;
    details.push("MCap mid");
  } else if (mcapM >= 100 && mcapM < 500) {
    score += 3;
    details.push("MCap small");
  } else if (mcapM > 20000 && mcapM <= 50000) {
    score += 2;
    details.push("MCap large");
  } else {
    score += 1;
    details.push("MCap mega/micro");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HYPERGROWTH BONUS: +5 pts (can exceed 100)
  // ═══════════════════════════════════════════════════════════════════════════

  // If revenueGrowth >150% AND grossMargin >50% AND accelerating
  if (
    fund.revenueGrowth != null &&
    fund.revenueGrowth > 150 &&
    gm > 0.50 &&
    isAccelerating
  ) {
    score += 5;
    details.push("🚀 HYPERGROWTH");
  }

  return { score, max: 100, details };
}

/**
 * Quant Mode Scoring (100 pts max)
 * Multi-factor scoring: Quality, Value, Momentum, Size, Shareholder Yield
 */
function scoreQuant(fund: FundamentalsData, chart: ChartData | null): ScoreComponent {
  let score = 0;
  const details: string[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALITY - PROFITABILITY: 25 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // ROE: 10 pts (>20%: 10, >15%: 7, >10%: 4, <10%: 0)
  // Note: fund.roe is already in percentage (e.g., 15 means 15%)
  if (fund.roe != null) {
    if (fund.roe > 20) {
      score += 10;
      details.push(`ROE ${fund.roe.toFixed(0)}%`);
    } else if (fund.roe > 15) {
      score += 7;
      details.push(`ROE ${fund.roe.toFixed(0)}%`);
    } else if (fund.roe > 10) {
      score += 4;
      details.push(`ROE ${fund.roe.toFixed(0)}%`);
    } else {
      details.push(`ROE ${fund.roe.toFixed(0)}%`);
    }
  }

  // Gross Margin: 8 pts (>50%: 8, >40%: 6, >30%: 4, <30%: 0)
  // Note: fund.grossMargin is a decimal (e.g., 0.5 means 50%)
  if (fund.grossMargin != null) {
    const gmPct = fund.grossMargin * 100;
    if (fund.grossMargin > 0.50) {
      score += 8;
      details.push(`GM ${gmPct.toFixed(0)}%`);
    } else if (fund.grossMargin > 0.40) {
      score += 6;
      details.push(`GM ${gmPct.toFixed(0)}%`);
    } else if (fund.grossMargin > 0.30) {
      score += 4;
      details.push(`GM ${gmPct.toFixed(0)}%`);
    } else {
      details.push(`GM ${gmPct.toFixed(0)}%`);
    }
  }

  // FCF Positive: 7 pts (yes: 7, no: 0)
  if (fund.freeCashflow != null && fund.freeCashflow > 0) {
    score += 7;
    details.push("FCF+");
  } else if (fund.freeCashflow != null) {
    details.push("FCF-");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALITY - STABILITY: 15 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // Debt/Equity: 8 pts (<30%: 8, <60%: 5, <100%: 2, >100%: 0)
  // Note: fund.debtToEquity from Yahoo is already in % (e.g., 30 means 30%)
  if (fund.debtToEquity != null) {
    if (fund.debtToEquity < 30) {
      score += 8;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    } else if (fund.debtToEquity < 60) {
      score += 5;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    } else if (fund.debtToEquity < 100) {
      score += 2;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    } else {
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    }
  }

  // Earnings Positive (EPS > 0): 7 pts - use PE as proxy (if PE exists and is positive, company is profitable)
  if (fund.pe != null && fund.pe > 0) {
    score += 7;
    details.push("EPS+");
  } else if (fund.pe != null) {
    details.push("EPS-");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALUE: 25 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // EV/EBITDA: 10 pts (<8: 10, <12: 7, <16: 4, >16: 0)
  if (fund.enterpriseToEbitda != null && fund.enterpriseToEbitda > 0) {
    if (fund.enterpriseToEbitda < 8) {
      score += 10;
      details.push(`EV/EBITDA ${fund.enterpriseToEbitda.toFixed(1)}`);
    } else if (fund.enterpriseToEbitda < 12) {
      score += 7;
      details.push(`EV/EBITDA ${fund.enterpriseToEbitda.toFixed(1)}`);
    } else if (fund.enterpriseToEbitda < 16) {
      score += 4;
      details.push(`EV/EBITDA ${fund.enterpriseToEbitda.toFixed(1)}`);
    } else {
      details.push(`EV/EBITDA ${fund.enterpriseToEbitda.toFixed(1)}`);
    }
  }

  // P/B: 8 pts (<1.5: 8, <2.5: 5, <4: 2, >4: 0)
  if (fund.pb != null && fund.pb > 0) {
    if (fund.pb < 1.5) {
      score += 8;
      details.push(`P/B ${fund.pb.toFixed(1)}`);
    } else if (fund.pb < 2.5) {
      score += 5;
      details.push(`P/B ${fund.pb.toFixed(1)}`);
    } else if (fund.pb < 4) {
      score += 2;
      details.push(`P/B ${fund.pb.toFixed(1)}`);
    } else {
      details.push(`P/B ${fund.pb.toFixed(1)}`);
    }
  }

  // FCF Yield: 7 pts (>8%: 7, >5%: 5, >3%: 3, <3%: 0)
  // Calculate as FCF/marketCap*100
  if (fund.freeCashflow != null && fund.mcapRaw > 0) {
    const fcfYield = (fund.freeCashflow / fund.mcapRaw) * 100;
    if (fcfYield > 8) {
      score += 7;
      details.push(`FCFYld ${fcfYield.toFixed(1)}%`);
    } else if (fcfYield > 5) {
      score += 5;
      details.push(`FCFYld ${fcfYield.toFixed(1)}%`);
    } else if (fcfYield > 3) {
      score += 3;
      details.push(`FCFYld ${fcfYield.toFixed(1)}%`);
    } else if (fcfYield > 0) {
      details.push(`FCFYld ${fcfYield.toFixed(1)}%`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOMENTUM: 15 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // Price vs SMA200: 8 pts (>10% above: 8, >0%: 5, >-10%: 2, <-10%: 0)
  if (chart && chart.sma200 != null && chart.sma200 > 0) {
    const pctAboveSma = ((chart.price - chart.sma200) / chart.sma200) * 100;
    if (pctAboveSma > 10) {
      score += 8;
      details.push(`+${pctAboveSma.toFixed(0)}% vs SMA200`);
    } else if (pctAboveSma > 0) {
      score += 5;
      details.push(`+${pctAboveSma.toFixed(0)}% vs SMA200`);
    } else if (pctAboveSma > -10) {
      score += 2;
      details.push(`${pctAboveSma.toFixed(0)}% vs SMA200`);
    } else {
      details.push(`${pctAboveSma.toFixed(0)}% vs SMA200`);
    }

    // Not Overextended: 7 pts (<25% above SMA200: 7, <40%: 4, >40%: 0)
    if (pctAboveSma < 25) {
      score += 7;
      details.push("Not overextended");
    } else if (pctAboveSma < 40) {
      score += 4;
      details.push("Slightly extended");
    } else {
      details.push("Overextended");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIZE: 10 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // Market Cap: $500M-$5B: 10, $5B-$20B: 7, $20B-$100B: 4, >$100B: 2, <$500M: 0
  const mcapB = fund.mcapRaw / 1e9; // Convert to billions
  if (mcapB >= 0.5 && mcapB <= 5) {
    score += 10;
    details.push(`MCap $${mcapB.toFixed(1)}B`);
  } else if (mcapB > 5 && mcapB <= 20) {
    score += 7;
    details.push(`MCap $${mcapB.toFixed(1)}B`);
  } else if (mcapB > 20 && mcapB <= 100) {
    score += 4;
    details.push(`MCap $${mcapB.toFixed(0)}B`);
  } else if (mcapB > 100) {
    score += 2;
    details.push(`MCap $${mcapB.toFixed(0)}B`);
  } else if (mcapB > 0) {
    details.push(`MCap $${(mcapB * 1000).toFixed(0)}M`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHAREHOLDER YIELD: 10 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // Dividend Yield: >4%: 10, >2%: 6, >1%: 3, <1%: 0
  // Note: dividendYield from Yahoo is a decimal (e.g., 0.04 means 4%)
  if (fund.dividendYield != null && fund.dividendYield > 0) {
    const divYieldPct = fund.dividendYield * 100;
    if (divYieldPct > 4) {
      score += 10;
      details.push(`Div ${divYieldPct.toFixed(1)}%`);
    } else if (divYieldPct > 2) {
      score += 6;
      details.push(`Div ${divYieldPct.toFixed(1)}%`);
    } else if (divYieldPct > 1) {
      score += 3;
      details.push(`Div ${divYieldPct.toFixed(1)}%`);
    } else {
      details.push(`Div ${divYieldPct.toFixed(1)}%`);
    }
  }

  return { score: Math.min(score, 100), max: 100, details };
}

/**
 * Value Mode Scoring (100 pts max)
 * Optimized for undervalued, cash-generative companies with quality characteristics
 */
function scoreValue(fund: FundamentalsData, chart: ChartData | null): ScoreComponent {
  let score = 0;
  const details: string[] = [];
  const TEN_YEAR_YIELD = 4.3; // Approximate 10-year Treasury yield

  // ═══════════════════════════════════════════════════════════════════════════
  // VALUATION: 40 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // EV/EBITDA: 12 pts (<6: 12, <8: 10, <10: 7, <14: 4, >14: 0)
  if (fund.enterpriseToEbitda != null && fund.enterpriseToEbitda > 0) {
    if (fund.enterpriseToEbitda < 6) {
      score += 12;
      details.push(`EV/EBITDA ${fund.enterpriseToEbitda.toFixed(1)}`);
    } else if (fund.enterpriseToEbitda < 8) {
      score += 10;
      details.push(`EV/EBITDA ${fund.enterpriseToEbitda.toFixed(1)}`);
    } else if (fund.enterpriseToEbitda < 10) {
      score += 7;
      details.push(`EV/EBITDA ${fund.enterpriseToEbitda.toFixed(1)}`);
    } else if (fund.enterpriseToEbitda < 14) {
      score += 4;
      details.push(`EV/EBITDA ${fund.enterpriseToEbitda.toFixed(1)}`);
    } else {
      details.push(`EV/EBITDA ${fund.enterpriseToEbitda.toFixed(1)}`);
    }
  }

  // Earnings Yield Spread vs 10Y: 10 pts
  // EY = 1/PE * 100, Spread = EY - 4.3%
  if (fund.pe != null && fund.pe > 0) {
    const earningsYield = (1 / fund.pe) * 100;
    const spread = earningsYield - TEN_YEAR_YIELD;
    if (spread > 6) {
      score += 10;
      details.push(`EY Spread +${spread.toFixed(1)}%`);
    } else if (spread > 4) {
      score += 8;
      details.push(`EY Spread +${spread.toFixed(1)}%`);
    } else if (spread > 2) {
      score += 5;
      details.push(`EY Spread +${spread.toFixed(1)}%`);
    } else if (spread > 0) {
      score += 2;
      details.push(`EY Spread +${spread.toFixed(1)}%`);
    } else {
      details.push(`EY Spread ${spread.toFixed(1)}%`);
    }
  }

  // P/FCF: 10 pts (<10: 10, <15: 7, <20: 4, <25: 2, >25: 0)
  if (fund.priceToFCF != null && fund.priceToFCF > 0) {
    if (fund.priceToFCF < 10) {
      score += 10;
      details.push(`P/FCF ${fund.priceToFCF.toFixed(1)}`);
    } else if (fund.priceToFCF < 15) {
      score += 7;
      details.push(`P/FCF ${fund.priceToFCF.toFixed(1)}`);
    } else if (fund.priceToFCF < 20) {
      score += 4;
      details.push(`P/FCF ${fund.priceToFCF.toFixed(1)}`);
    } else if (fund.priceToFCF < 25) {
      score += 2;
      details.push(`P/FCF ${fund.priceToFCF.toFixed(1)}`);
    } else {
      details.push(`P/FCF ${fund.priceToFCF.toFixed(1)}`);
    }
  }

  // P/B: 8 pts (<1: 8, <1.5: 6, <2.5: 4, <4: 2, >4: 0)
  if (fund.pb != null && fund.pb > 0) {
    if (fund.pb < 1) {
      score += 8;
      details.push(`P/B ${fund.pb.toFixed(2)}`);
    } else if (fund.pb < 1.5) {
      score += 6;
      details.push(`P/B ${fund.pb.toFixed(2)}`);
    } else if (fund.pb < 2.5) {
      score += 4;
      details.push(`P/B ${fund.pb.toFixed(2)}`);
    } else if (fund.pb < 4) {
      score += 2;
      details.push(`P/B ${fund.pb.toFixed(2)}`);
    } else {
      details.push(`P/B ${fund.pb.toFixed(2)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CASH GENERATION: 25 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // FCF Yield (FCF/MarketCap*100): 10 pts (>10%: 10, >7%: 8, >5%: 6, >3%: 3, <3%: 0)
  if (fund.freeCashflow != null && fund.mcapRaw > 0) {
    const fcfYield = (fund.freeCashflow / fund.mcapRaw) * 100;
    if (fcfYield > 10) {
      score += 10;
      details.push(`FCF Yield ${fcfYield.toFixed(1)}%`);
    } else if (fcfYield > 7) {
      score += 8;
      details.push(`FCF Yield ${fcfYield.toFixed(1)}%`);
    } else if (fcfYield > 5) {
      score += 6;
      details.push(`FCF Yield ${fcfYield.toFixed(1)}%`);
    } else if (fcfYield > 3) {
      score += 3;
      details.push(`FCF Yield ${fcfYield.toFixed(1)}%`);
    } else if (fcfYield > 0) {
      details.push(`FCF Yield ${fcfYield.toFixed(1)}%`);
    } else {
      details.push(`FCF Yield ${fcfYield.toFixed(1)}%`);
    }
  }

  // FCF Margin (FCF/Revenue*100): 8 pts (>20%: 8, >12%: 6, >6%: 4, >0%: 2, <0%: 0)
  if (fund.freeCashflow != null && fund.totalRevenue != null && fund.totalRevenue > 0) {
    const fcfMargin = (fund.freeCashflow / fund.totalRevenue) * 100;
    if (fcfMargin > 20) {
      score += 8;
      details.push(`FCF Margin ${fcfMargin.toFixed(1)}%`);
    } else if (fcfMargin > 12) {
      score += 6;
      details.push(`FCF Margin ${fcfMargin.toFixed(1)}%`);
    } else if (fcfMargin > 6) {
      score += 4;
      details.push(`FCF Margin ${fcfMargin.toFixed(1)}%`);
    } else if (fcfMargin > 0) {
      score += 2;
      details.push(`FCF Margin ${fcfMargin.toFixed(1)}%`);
    } else {
      details.push(`FCF Margin ${fcfMargin.toFixed(1)}%`);
    }
  }

  // FCF/Debt: 7 pts (>0.5: 7, >0.25: 5, >0.15: 3, >0.08: 1, <0.08: 0)
  if (fund.freeCashflow != null && fund.totalDebt != null && fund.totalDebt > 0) {
    const fcfToDebt = fund.freeCashflow / fund.totalDebt;
    if (fcfToDebt > 0.5) {
      score += 7;
      details.push(`FCF/Debt ${fcfToDebt.toFixed(2)}`);
    } else if (fcfToDebt > 0.25) {
      score += 5;
      details.push(`FCF/Debt ${fcfToDebt.toFixed(2)}`);
    } else if (fcfToDebt > 0.15) {
      score += 3;
      details.push(`FCF/Debt ${fcfToDebt.toFixed(2)}`);
    } else if (fcfToDebt > 0.08) {
      score += 1;
      details.push(`FCF/Debt ${fcfToDebt.toFixed(2)}`);
    } else {
      details.push(`FCF/Debt ${fcfToDebt.toFixed(2)}`);
    }
  } else if (fund.freeCashflow != null && fund.freeCashflow > 0 && (fund.totalDebt == null || fund.totalDebt === 0)) {
    // No debt is a bonus
    score += 7;
    details.push("FCF+, No Debt");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALITY & DURABILITY: 25 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // ROIC: 10 pts (>20%: 10, >15%: 8, >12%: 6, >8%: 3, <8%: 0)
  if (fund.roic != null) {
    if (fund.roic > 20) {
      score += 10;
      details.push(`ROIC ${fund.roic.toFixed(1)}%`);
    } else if (fund.roic > 15) {
      score += 8;
      details.push(`ROIC ${fund.roic.toFixed(1)}%`);
    } else if (fund.roic > 12) {
      score += 6;
      details.push(`ROIC ${fund.roic.toFixed(1)}%`);
    } else if (fund.roic > 8) {
      score += 3;
      details.push(`ROIC ${fund.roic.toFixed(1)}%`);
    } else {
      details.push(`ROIC ${fund.roic.toFixed(1)}%`);
    }
  }

  // Interest Coverage (EBIT/Interest): 6 pts (>10: 6, >6: 5, >4: 3, >2: 1, <2: 0)
  if (fund.ebit != null && fund.interestExpense != null && fund.interestExpense > 0) {
    const interestCoverage = Math.abs(fund.ebit / fund.interestExpense);
    if (interestCoverage > 10) {
      score += 6;
      details.push(`Int Cov ${interestCoverage.toFixed(1)}x`);
    } else if (interestCoverage > 6) {
      score += 5;
      details.push(`Int Cov ${interestCoverage.toFixed(1)}x`);
    } else if (interestCoverage > 4) {
      score += 3;
      details.push(`Int Cov ${interestCoverage.toFixed(1)}x`);
    } else if (interestCoverage > 2) {
      score += 1;
      details.push(`Int Cov ${interestCoverage.toFixed(1)}x`);
    } else {
      details.push(`Int Cov ${interestCoverage.toFixed(1)}x`);
    }
  } else if (fund.ebit != null && fund.ebit > 0 && (fund.interestExpense == null || fund.interestExpense === 0)) {
    // No interest expense is good
    score += 6;
    details.push("No Int Exp");
  }

  // Debt/Equity: 5 pts (<30%: 5, <60%: 4, <100%: 3, <150%: 1, >150%: 0)
  if (fund.debtToEquity != null) {
    if (fund.debtToEquity < 30) {
      score += 5;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    } else if (fund.debtToEquity < 60) {
      score += 4;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    } else if (fund.debtToEquity < 100) {
      score += 3;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    } else if (fund.debtToEquity < 150) {
      score += 1;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    } else {
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}%`);
    }
  }

  // ROE: 4 pts (>18%: 4, >12%: 3, >8%: 2, <8%: 0)
  if (fund.roe != null) {
    if (fund.roe > 18) {
      score += 4;
      details.push(`ROE ${fund.roe.toFixed(1)}%`);
    } else if (fund.roe > 12) {
      score += 3;
      details.push(`ROE ${fund.roe.toFixed(1)}%`);
    } else if (fund.roe > 8) {
      score += 2;
      details.push(`ROE ${fund.roe.toFixed(1)}%`);
    } else {
      details.push(`ROE ${fund.roe.toFixed(1)}%`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIVIDEND: 10 pts
  // ═══════════════════════════════════════════════════════════════════════════

  // Dividend Yield: 5 pts (>4%: 5, >2.5%: 4, >1.5%: 3, >0%: 2, 0%: 1)
  if (fund.dividendYield != null) {
    const divYield = fund.dividendYield * 100; // Convert to percentage
    if (divYield > 4) {
      score += 5;
      details.push(`Div Yield ${divYield.toFixed(1)}%`);
    } else if (divYield > 2.5) {
      score += 4;
      details.push(`Div Yield ${divYield.toFixed(1)}%`);
    } else if (divYield > 1.5) {
      score += 3;
      details.push(`Div Yield ${divYield.toFixed(1)}%`);
    } else if (divYield > 0) {
      score += 2;
      details.push(`Div Yield ${divYield.toFixed(1)}%`);
    } else {
      score += 1;
      details.push("No Div");
    }
  } else {
    score += 1; // No dividend data - give 1 pt
    details.push("No Div");
  }

  // Payout Ratio: 5 pts (20-50%: 5, 50-70%: 4, 10-20%: 3, 70-90%: 2, else: 1, >100%: 0)
  if (fund.payoutRatio != null) {
    const payout = fund.payoutRatio * 100; // Convert to percentage
    if (payout > 100) {
      // Paying more than earnings - unsustainable
      details.push(`Payout ${payout.toFixed(0)}%!`);
    } else if (payout >= 20 && payout <= 50) {
      score += 5;
      details.push(`Payout ${payout.toFixed(0)}%`);
    } else if (payout > 50 && payout <= 70) {
      score += 4;
      details.push(`Payout ${payout.toFixed(0)}%`);
    } else if (payout >= 10 && payout < 20) {
      score += 3;
      details.push(`Payout ${payout.toFixed(0)}%`);
    } else if (payout > 70 && payout <= 90) {
      score += 2;
      details.push(`Payout ${payout.toFixed(0)}%`);
    } else if (payout > 0) {
      score += 1;
      details.push(`Payout ${payout.toFixed(0)}%`);
    }
  }

  return { score: Math.min(score, 100), max: 100, details };
}

function calculateRisk(chart: ChartData | null, fund: FundamentalsData, market: "US" | "SGX" | "HK" | "JP" | "CN"): RiskAnalysis {
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

function getRiskTier(fund: FundamentalsData, market: "US" | "SGX" | "HK" | "JP" | "CN"): string {
  if (market === "SGX" || market === "HK" || market === "JP" || market === "CN") {
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

function getMarket(ticker: string): "US" | "SGX" | "HK" | "JP" | "CN" {
  if (ticker.endsWith(".SI")) return "SGX";
  if (ticker.endsWith(".HK")) return "HK";
  if (ticker.endsWith(".T")) return "JP";
  if (ticker.endsWith(".SS") || ticker.endsWith(".SZ")) return "CN";
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
    
    if (marketsToScan.includes("CN")) {
      const cnSet = new Set(CN_TICKERS);
      cnSet.forEach(t => tickerSources!.set(t, { market: "CN", source: "curated" }));
      console.log(`CN: ${cnSet.size} tickers`);
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
      const technical = scoreTechnical(chart);
      const risk = calculateRisk(chart, fund, market);

      // Multi-mode scoring (each 0-100)
      const quantResult = scoreQuant(fund, chart);
      const valueResult = scoreValue(fund, chart);
      const growthModeResult = scoreGrowthMode(fund, chart);
      
      // Combined score = average of the 3 modes
      const combinedScore = Math.round((quantResult.score + valueResult.score + growthModeResult.score) / 3);
      
      // Use combined score as the main score now
      const totalScore = Math.max(0, combinedScore + risk.penalty);

      const { tier, tierColor } = classifyStock(totalScore);
      const riskTier = getRiskTier(fund, market);

      const tickerClean = ticker.replace(".SI", "").replace(".HK", "").replace(".SS", "").replace(".SZ", "");

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
        technical,
        risk,
        source,
        revGrowth: fund.revenueGrowthRaw,
        grossMargin: fund.grossMargin,
        // Multi-mode scores
        quantScore: quantResult.score,
        valueScore: valueResult.score,
        growthScore: growthModeResult.score,
        combinedScore,
        quantBreakdown: quantResult,
        valueBreakdown: valueResult,
        growthBreakdown: growthModeResult,
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
    cnCount: results.filter((r) => r.market === "CN").length,
  };

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log(" SUMMARY");
  console.log("=".repeat(80));
  console.log(`Scanned: ${summary.scannedCount}/${summary.universeSize}`);
  console.log(`US: ${summary.usCount} | SGX: ${summary.sgxCount} | HK: ${summary.hkCount} | JP: ${summary.jpCount} | CN: ${summary.cnCount}`);
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
