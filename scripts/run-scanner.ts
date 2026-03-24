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

// ── Stock Universe ───────────────────────────────────────────────────────────

const US_TICKERS = [
  // AI Infrastructure
  "NBIS", "CRWV", "APLD", "SMCI", "VRT", "ANET",
  // AI Software/Platform
  "PLTR", "SNOW", "DDOG", "MDB", "NET", "CFLT",
  // Cybersecurity
  "CRWD", "PANW", "ZS", "S",
  // Fintech / Payments
  "AFRM", "SOFI", "DLO", "TOST",
  // E-commerce / Consumer
  "SHOP", "MELI", "SE", "DUOL",
  // Healthcare Tech
  "HIMS", "DOCS", "CERT",
  // Clean Energy / EV
  "ENPH", "SEDG", "RIVN", "LCID",
  // Space / Defense Tech
  "RKLB", "PL", "ASTS",
  // Other High Growth
  "CELH", "AXON", "TTD", "BILL",
];

const SGX_TICKERS = [
  // STI Components
  "D05.SI", "O39.SI", "U11.SI", "Z74.SI", "CC3.SI", "C6L.SI",
  "S58.SI", "C09.SI", "U14.SI", "C31.SI", "S63.SI", "V03.SI",
  "BS6.SI", "S51.SI", "G13.SI", "BN4.SI", "Y92.SI", "F34.SI",
  "S68.SI", "H78.SI", "U96.SI", "9CI.SI", "A17U.SI", "M44U.SI",
  "N2IU.SI", "ME8U.SI", "BUOU.SI", "J36.SI", "C38U.SI", "J69U.SI",
  "T39.SI",
  // Mid caps
  "AWX.SI", "BN2.SI", "B69.SI", "5DD.SI", "F03.SI", "OV8.SI",
  "1D0.SI", "BDR.SI", "Q0F.SI", "ER0.SI", "WJP.SI", "AIY.SI",
  "CLW.SI", "544.SI", "RE4.SI", "NO4.SI", "F9D.SI", "S56.SI",
  "BTP.SI", "E3B.SI", "5CF.SI", "S41.SI", "AGS.SI", "AWG.SI",
  "BQF.SI", "5HG.SI", "S85.SI", "5TP.SI", "AZR.SI", "5OI.SI",
  "U09.SI", "A30.SI", "P8Z.SI", "1F3.SI", "P15.SI", "BTOU.SI",
  "AJBU.SI", "T82U.SI", "SK6U.SI", "OXMU.SI", "AU8U.SI",
  "CRPU.SI", "CY6U.SI", "JYEU.SI", "HMN.SI", "BEW.SI", "MZH.SI",
  "EB5.SI", "GRQ.SI", "BKW.SI", "A7RU.SI", "S59.SI", "C2PU.SI",
  "J91U.SI", "DHLU.SI", "S71.SI", "BDX.SI", "RF7.SI", "5JS.SI",
  "NR7.SI", "CFA.SI", "S20.SI", "N03.SI", "5G4.SI", "BLU.SI",
  "A04.SI", "U06.SI", "Z59.SI", "U10.SI", "T13.SI", "5AI.SI",
  "CHJ.SI", "1A1.SI", "F17.SI", "BHK.SI", "T14.SI", "TQ5.SI",
  "5G1.SI", "H30.SI", "564.SI", "C8R.SI", "5I4.SI", "YF8.SI",
  "J85.SI", "OYY.SI", "CWBU.SI", "Z25.SI", "C61U.SI", "40T.SI",
];

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
  market: "US" | "SGX";
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Yahoo Finance Fetchers ───────────────────────────────────────────────────

interface ChartData {
  price: number;
  high52: number;
  low52: number;
  sma50: number | null;
  sma200: number | null;
  position52w: number;
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

    return { price, high52, low52, sma50, sma200, position52w };
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
  revenueGrowth: number | null;
  revenueGrowthRaw: number | null;
  grossMargin: number | null;
  profitMargin: number | null;
  freeCashflow: number | null;
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

    // Revenue growth calculation
    let revenueGrowth: number | null = null;
    const quarterly = earnings.financialsChart?.quarterly;
    if (quarterly && quarterly.length >= 2) {
      const recent = quarterly[quarterly.length - 1]?.revenue?.raw;
      const prev = quarterly[quarterly.length - 2]?.revenue?.raw;
      if (recent && prev && prev > 0) {
        revenueGrowth = ((recent - prev) / prev) * 100;
      }
    }
    if (revenueGrowth === null && fin.revenueGrowth?.raw != null) {
      revenueGrowth = fin.revenueGrowth.raw * 100;
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
      revenueGrowth,
      revenueGrowthRaw: fin.revenueGrowth ?? null,
      grossMargin: fin.grossMargins ?? null,
      profitMargin: fin.profitMargins ? fin.profitMargins * 100 : null,
      freeCashflow: fin.freeCashflow ?? null,
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

  // ROE (0-15 pts)
  if (fund.roe != null) {
    if (fund.roe > 25) {
      score += 15;
      details.push(`ROE ${fund.roe.toFixed(0)}%`);
    } else if (fund.roe > 15) {
      score += 10;
      details.push(`ROE ${fund.roe.toFixed(0)}%`);
    } else if (fund.roe > 10) {
      score += 5;
      details.push(`ROE ${fund.roe.toFixed(0)}%`);
    } else {
      details.push(`ROE ${fund.roe.toFixed(0)}%`);
    }
  }

  // Revenue growth (0-10 pts)
  if (fund.revenueGrowth != null) {
    if (fund.revenueGrowth > 20) {
      score += 10;
      details.push(`Rev+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 10) {
      score += 5;
      details.push(`Rev+${fund.revenueGrowth.toFixed(0)}%`);
    } else if (fund.revenueGrowth > 0) {
      score += 2;
      details.push(`Rev+${fund.revenueGrowth.toFixed(0)}%`);
    } else {
      details.push(`Rev ${fund.revenueGrowth.toFixed(0)}%`);
    }
  }

  // Earnings acceleration (0-5 pts)
  if (fund.forwardPE && fund.pe && fund.forwardPE < fund.pe * 0.9) {
    score += 5;
    details.push("Earnings accelerating");
  }

  // P/E value (0-5 pts)
  if (fund.pe != null && typeof fund.pe === "number" && fund.pe > 0) {
    if (fund.pe < 10) {
      score += 5;
      details.push(`PE ${fund.pe.toFixed(1)}`);
    } else if (fund.pe < 15) {
      score += 3;
      details.push(`PE ${fund.pe.toFixed(1)}`);
    } else {
      details.push(`PE ${fund.pe.toFixed(1)}`);
    }
  }

  return { score: Math.min(score, 35), max: 35, details };
}

function scoreFinancial(fund: FundamentalsData): ScoreComponent {
  let score = 0;
  const details: string[] = [];

  // Free cash flow (0-5 pts)
  if (fund.freeCashflow != null && fund.freeCashflow > 0) {
    score += 5;
    details.push("FCF+");
  }

  // Low debt (0-5 pts)
  if (fund.debtToEquity != null) {
    if (fund.debtToEquity < 30) {
      score += 5;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}`);
    } else if (fund.debtToEquity < 50) {
      score += 3;
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}`);
    } else {
      details.push(`D/E ${fund.debtToEquity.toFixed(0)}`);
    }
  }

  // Profit margin (0-5 pts)
  if (fund.profitMargin != null) {
    if (fund.profitMargin >= 15) {
      score += 5;
      details.push(`Margin ${fund.profitMargin.toFixed(0)}%`);
    } else if (fund.profitMargin >= 8) {
      score += 2;
      details.push(`Margin ${fund.profitMargin.toFixed(0)}%`);
    } else {
      details.push(`Margin ${fund.profitMargin.toFixed(0)}%`);
    }
  }

  // P/B valuation (0-5 pts)
  if (fund.pb != null) {
    if (fund.pb < 0.8) {
      score += 5;
      details.push(`PB ${fund.pb.toFixed(2)}`);
    } else if (fund.pb < 1.0) {
      score += 3;
      details.push(`PB ${fund.pb.toFixed(2)}`);
    } else {
      details.push(`PB ${fund.pb.toFixed(2)}`);
    }
  }

  return { score: Math.min(score, 20), max: 20, details };
}

function scoreInsider(fund: FundamentalsData): ScoreComponent {
  let score = 0;
  const details: string[] = [];

  if (fund.insiderTxCount > 0) {
    // Net insider buying (0-15 pts)
    if (fund.insiderBuys > fund.insiderSells) {
      score += 15;
      details.push(`Net Buy ${fund.insiderBuys.toLocaleString()} shares`);
    }
    // No selling bonus (0-10 pts)
    if (fund.insiderSells === 0) {
      score += 10;
      details.push("No insider sells");
    } else {
      details.push(
        `Buy:${fund.insiderBuys.toLocaleString()} Sell:${fund.insiderSells.toLocaleString()}`
      );
    }
  } else {
    // Fallback: high insider ownership (0-5 pts)
    if (fund.insiderPct != null && fund.insiderPct > 30) {
      score += 5;
      details.push(`Insider owns ${fund.insiderPct.toFixed(0)}%`);
    } else if (fund.insiderPct != null) {
      details.push(`Insider ${fund.insiderPct.toFixed(0)}%`);
    } else {
      details.push("No insider data");
    }
  }

  return { score: Math.min(score, 25), max: 25, details };
}

function scoreTechnical(chart: ChartData | null): ScoreComponent {
  let score = 0;
  const details: string[] = [];

  if (!chart) return { score: 0, max: 15, details: ["No chart data"] };

  // Above 50-day SMA (0-5 pts)
  if (chart.sma50 && chart.price > chart.sma50) {
    score += 5;
    details.push(">50MA");
  } else {
    details.push("<50MA");
  }

  // Above 200-day SMA (0-5 pts)
  if (chart.sma200 && chart.price > chart.sma200) {
    score += 5;
    details.push(">200MA");
  } else {
    details.push("<200MA");
  }

  // 52-week position (0-5 pts)
  if (chart.position52w >= 80) {
    score += 5;
    details.push(`52W: ${chart.position52w.toFixed(0)}%`);
  } else if (chart.position52w >= 50) {
    score += 3;
    details.push(`52W: ${chart.position52w.toFixed(0)}%`);
  } else {
    details.push(`52W: ${chart.position52w.toFixed(0)}%`);
  }

  return { score: Math.min(score, 15), max: 15, details };
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

function calculateRisk(chart: ChartData | null, fund: FundamentalsData, market: "US" | "SGX"): RiskAnalysis {
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

function getRiskTier(fund: FundamentalsData, market: "US" | "SGX"): string {
  if (market === "SGX") {
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

function getMarket(ticker: string): "US" | "SGX" {
  return ticker.endsWith(".SI") ? "SGX" : "US";
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
  
  // Build ticker universe
  const allTickers: string[] = [];
  if (marketsToScan.includes("US")) {
    allTickers.push(...US_TICKERS);
  }
  if (marketsToScan.includes("SGX")) {
    allTickers.push(...SGX_TICKERS);
  }

  console.log(`\nMarkets: ${marketsToScan.join(", ")}`);
  console.log(`Universe: ${allTickers.length} tickers\n`);

  const results: ScanResult[] = [];
  let done = 0;
  const total = allTickers.length;

  for (const ticker of allTickers) {
    done++;
    const market = getMarket(ticker);
    
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
        insider.score +
        technical.score +
        analyst.score +
        risk.penalty;
      const totalScore = Math.max(0, rawScore);

      const { tier, tierColor } = classifyStock(totalScore);
      const riskTier = getRiskTier(fund, market);

      const tickerClean = ticker.replace(".SI", "");

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
        source: "curated",
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
  };

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log(" SUMMARY");
  console.log("=".repeat(80));
  console.log(`Scanned: ${summary.scannedCount}/${summary.universeSize}`);
  console.log(`US: ${summary.usCount} | SGX: ${summary.sgxCount}`);
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
