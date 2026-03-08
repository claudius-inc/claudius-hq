#!/usr/bin/env node
/**
 * Unified Stock Scanner
 * Scans both US growth stocks and SGX stocks with a single scoring system.
 *
 * Scoring (max ~105 pts before risk penalties):
 *   Growth Quality:     35 pts  (ROE, revenue, earnings acceleration, P/E value)
 *   Financial Strength: 20 pts  (FCF, debt, profit margin, P/B valuation)
 *   Insider Activity:   25 pts  (insider transactions, ownership)
 *   Technical Momentum: 15 pts  (SMAs, 52w position)
 *   Analyst Sentiment:  10 pts  (recommendations, target upside)
 *   Risk Penalties:     up to -20 pts
 *
 * Tiers:
 *   HIGH CONVICTION  (score >= 70)
 *   SPECULATIVE      (score 50-69)
 *   WATCHLIST        (score 35-49)
 *   AVOID            (score < 35)
 *
 * Usage:
 *   node unified-scanner.js [--limit N] [--json] [--upload|-u] [--save|-s]
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// ── US Growth Universe ───────────────────────────────────────────────────────
const US_TICKERS = [
  // AI Infrastructure
  "NBIS",
  "CRWV",
  "APLD",
  "SMCI",
  "VRT",
  "ANET",
  // AI Software/Platform
  "PLTR",
  "SNOW",
  "DDOG",
  "MDB",
  "NET",
  "CFLT",
  // Cybersecurity
  "CRWD",
  "PANW",
  "ZS",
  "S",
  // Fintech / Payments
  "AFRM",
  "SOFI",
  "DLO",
  "TOST",
  // E-commerce / Consumer
  "SHOP",
  "MELI",
  "SE",
  "DUOL",
  // Healthcare Tech
  "HIMS",
  "DOCS",
  "CERT",
  // Clean Energy / EV
  "ENPH",
  "SEDG",
  "RIVN",
  "LCID",
  // Space / Defense Tech
  "RKLB",
  "PL",
  "ASTS",
  // Other High Growth
  "CELH",
  "AXON",
  "TTD",
  "BILL",
];

// ── SGX Universe ─────────────────────────────────────────────────────────────
const SGX_TICKERS = [
  // STI Components
  "D05.SI",
  "O39.SI",
  "U11.SI",
  "Z74.SI",
  "CC3.SI",
  "C6L.SI",
  "S58.SI",
  "C09.SI",
  "U14.SI",
  "C31.SI",
  "S63.SI",
  "V03.SI",
  "BS6.SI",
  "S51.SI",
  "G13.SI",
  "BN4.SI",
  "Y92.SI",
  "F34.SI",
  "S68.SI",
  "H78.SI",
  "U96.SI",
  "9CI.SI",
  "A17U.SI",
  "M44U.SI",
  "N2IU.SI",
  "ME8U.SI",
  "BUOU.SI",
  "J36.SI",
  "C38U.SI",
  "J69U.SI",
  "T39.SI",
  // Mid caps
  "AWX.SI",
  "BN2.SI",
  "B69.SI",
  "5DD.SI",
  "F03.SI",
  "OV8.SI",
  "1D0.SI",
  "BDR.SI",
  "Q0F.SI",
  "ER0.SI",
  "WJP.SI",
  "AIY.SI",
  "CLW.SI",
  "544.SI",
  "RE4.SI",
  "NO4.SI",
  "F9D.SI",
  "S56.SI",
  "BTP.SI",
  "E3B.SI",
  "5CF.SI",
  "S41.SI",
  "AGS.SI",
  "AWG.SI",
  "BQF.SI",
  "5HG.SI",
  "S85.SI",
  "5TP.SI",
  "AZR.SI",
  "5OI.SI",
  "U09.SI",
  "A30.SI",
  "P8Z.SI",
  "1F3.SI",
  "P15.SI",
  "BTOU.SI",
  "AJBU.SI",
  "T82U.SI",
  "SK6U.SI",
  "OXMU.SI",
  "AU8U.SI",
  "CRPU.SI",
  "CY6U.SI",
  "JYEU.SI",
  "HMN.SI",
  "BEW.SI",
  "MZH.SI",
  "EB5.SI",
  "GRQ.SI",
  "BKW.SI",
  "A7RU.SI",
  "S59.SI",
  "C2PU.SI",
  "J91U.SI",
  "DHLU.SI",
  "S71.SI",
  "BDX.SI",
  "RF7.SI",
  "5JS.SI",
  "NR7.SI",
  "CFA.SI",
  "S20.SI",
  "N03.SI",
  "5G4.SI",
  "BLU.SI",
  "A04.SI",
  "U06.SI",
  "Z59.SI",
  "U10.SI",
  "T13.SI",
  "5AI.SI",
  "CHJ.SI",
  "1A1.SI",
  "F17.SI",
  "BHK.SI",
  "T14.SI",
  "TQ5.SI",
  "5G1.SI",
  "H30.SI",
  "564.SI",
  "C8R.SI",
  "5I4.SI",
  "YF8.SI",
  "J85.SI",
  "OYY.SI",
  "CWBU.SI",
  // From accumulation scanner
  "Z25.SI",
  "C61U.SI",
  "40T.SI",
];

// Combine and deduplicate
const ALL_TICKERS = [...new Set([...US_TICKERS, ...SGX_TICKERS])];

function getMarket(ticker) {
  return ticker.endsWith(".SI") ? "SGX" : "US";
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
let COOKIES = "";
let CRUMB = "";

function request(url, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.get(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...(COOKIES ? { Cookie: COOKIES } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.headers["set-cookie"]) {
          const nc = res.headers["set-cookie"]
            .map((c) => c.split(";")[0])
            .join("; ");
          COOKIES = COOKIES ? COOKIES + "; " + nc : nc;
        }
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, data: d }));
      },
    );
    req.on("error", () => resolve({ status: 0, data: "" }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, data: "" });
    });
  });
}

async function initAuth() {
  await request("https://fc.yahoo.com/");
  const r = await request("https://query2.finance.yahoo.com/v1/test/getcrumb");
  CRUMB = r.data.trim();
  if (!CRUMB || CRUMB.includes("<")) {
    const r2 = await request("https://finance.yahoo.com/quote/AAPL/");
    const m = r2.data.match(/"crumb"\s*:\s*"([^"]+)"/);
    if (m) CRUMB = m[1].replace(/\\u002F/g, "/");
  }
  return !!CRUMB;
}

// ── Data fetchers ────────────────────────────────────────────────────────────

async function getChartData(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
  const r = await request(url);
  try {
    const d = JSON.parse(r.data);
    const result = d.chart?.result?.[0];
    if (!result) return null;
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(
      (c) => c != null,
    );
    if (closes.length < 50) return null;

    const price = result.meta.regularMarketPrice;
    const high52 = Math.max(...closes);
    const low52 = Math.min(...closes);
    const sma = (arr, n) =>
      arr.length >= n ? arr.slice(-n).reduce((a, b) => a + b, 0) / n : null;
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, Math.min(200, closes.length));

    const position52w =
      high52 !== low52 ? ((price - low52) / (high52 - low52)) * 100 : 50;

    return { price, high52, low52, sma50, sma200, position52w };
  } catch {
    return null;
  }
}

async function getFundamentals(ticker) {
  if (!CRUMB) return null;
  const modules =
    "defaultKeyStatistics,financialData,price,summaryDetail,earnings,majorHoldersBreakdown,insiderTransactions,recommendationTrend";
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&crumb=${encodeURIComponent(CRUMB)}`;
  const r = await request(url);
  try {
    const d = JSON.parse(r.data);
    const res = d.quoteSummary?.result?.[0];
    if (!res) return null;

    const fin = res.financialData || {};
    const price = res.price || {};
    const summary = res.summaryDetail || {};
    const stats = res.defaultKeyStatistics || {};
    const earnings = res.earnings || {};
    const holders = res.majorHoldersBreakdown || {};
    const insiderTx = res.insiderTransactions?.transactions || [];
    const recoTrend = res.recommendationTrend?.trend || [];

    // Revenue growth from earnings history
    let revenueGrowth = null;
    const quarterly = earnings.financialsChart?.quarterly;
    if (quarterly && quarterly.length >= 2) {
      const recent = quarterly[quarterly.length - 1].revenue?.raw;
      const prev = quarterly[quarterly.length - 2].revenue?.raw;
      if (recent && prev && prev > 0)
        revenueGrowth = ((recent - prev) / prev) * 100;
    }
    if (revenueGrowth == null && fin.revenueGrowth?.raw != null) {
      revenueGrowth = fin.revenueGrowth.raw * 100;
    }

    // Insider activity analysis (last 6 months)
    let insiderBuys = 0,
      insiderSells = 0;
    const sixMonthsAgo = Date.now() / 1000 - 180 * 86400;
    for (const tx of insiderTx) {
      const date = tx.startDate?.raw || 0;
      if (date < sixMonthsAgo) continue;
      const shares = tx.shares?.raw || 0;
      if (tx.transaction === "Purchase" || tx.text?.includes("Purchase"))
        insiderBuys += shares;
      else if (tx.transaction === "Sale" || tx.text?.includes("Sale"))
        insiderSells += Math.abs(shares);
    }

    // Ownership
    const insiderPct = holders.insidersPercentHeld?.raw
      ? holders.insidersPercentHeld.raw * 100
      : null;
    const instPct = holders.institutionsPercentHeld?.raw
      ? holders.institutionsPercentHeld.raw * 100
      : null;

    // Analyst recommendations (current period)
    const reco = recoTrend[0] || {};
    const strongBuy = reco.strongBuy || 0;
    const buy = reco.buy || 0;
    const hold = reco.hold || 0;
    const sell = reco.sell || 0;
    const strongSell = reco.strongSell || 0;

    // Short interest (US stocks mainly)
    const shortPctFloat = stats.shortPercentOfFloat?.raw ?? null;
    const beta = stats.beta?.raw ?? null;

    return {
      name: (price.longName || price.shortName || ticker).substring(0, 40),
      mcapRaw: price.marketCap?.raw || 0,
      mcapM: price.marketCap?.raw ? Math.round(price.marketCap.raw / 1e6) : 0,
      pe: summary.trailingPE?.raw ?? null,
      forwardPE: summary.forwardPE?.raw ?? stats.forwardPE?.raw ?? null,
      pb: price.priceToBook?.raw ?? stats.priceToBook?.raw ?? null,
      roe: fin.returnOnEquity?.raw ? fin.returnOnEquity.raw * 100 : null,
      revenueGrowth,
      revenueGrowthRaw: fin.revenueGrowth?.raw ?? null,
      grossMargin: fin.grossMargins?.raw ?? null,
      profitMargin: fin.profitMargins?.raw ? fin.profitMargins.raw * 100 : null,
      freeCashflow: fin.freeCashflow?.raw ?? null,
      debtToEquity: fin.debtToEquity?.raw ?? null,
      divYield: summary.dividendYield?.raw
        ? summary.dividendYield.raw * 100
        : null,
      targetPrice: fin.targetMeanPrice?.raw ?? null,
      analystCount: fin.numberOfAnalystOpinions?.raw || 0,
      insiderBuys,
      insiderSells,
      insiderTxCount: insiderTx.length,
      insiderPct,
      instPct,
      strongBuy,
      buy,
      hold,
      sell,
      strongSell,
      shortPctFloat,
      beta,
    };
  } catch {
    return null;
  }
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function scoreGrowth(fund) {
  let score = 0;
  const details = [];

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

  // Earnings acceleration: forward PE < trailing PE (0-5 pts)
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

function scoreFinancial(fund) {
  let score = 0;
  const details = [];

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

  // Profit margin bonus (0-5 pts)
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

  // P/B valuation bonus (0-5 pts)
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

function scoreInsider(fund) {
  let score = 0;
  const details = [];

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
        `Buy:${fund.insiderBuys.toLocaleString()} Sell:${fund.insiderSells.toLocaleString()}`,
      );
    }
  } else {
    // Fallback: high insider ownership suggests alignment (0-5 pts)
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

function scoreTechnical(chart) {
  let score = 0;
  const details = [];

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

function scoreAnalyst(fund, chart) {
  let score = 0;
  const details = [];

  const total =
    fund.strongBuy + fund.buy + fund.hold + fund.sell + fund.strongSell;
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

function calculateRisk(chart, fund, market) {
  let penalty = 0;
  const flags = [];

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

function classifyStock(totalScore) {
  if (totalScore >= 70) return { tier: "HIGH CONVICTION", tierColor: "green" };
  if (totalScore >= 50) return { tier: "SPECULATIVE", tierColor: "yellow" };
  if (totalScore >= 35) return { tier: "WATCHLIST", tierColor: "blue" };
  return { tier: "AVOID", tierColor: "red" };
}

function getRiskTier(fund, chart, market) {
  if (market === "SGX") {
    // SGX-specific: mcap + D/E thresholds
    const mcapM = fund.mcapM || 0;
    const de = fund.debtToEquity || 0;
    if (mcapM < 50 || de > 200) return "TIER 3";
    if (mcapM < 200 || de > 100) return "TIER 2";
    return "TIER 1";
  } else {
    // US-specific: short interest + beta
    const shortPct = fund.shortPctFloat || 0;
    const beta = fund.beta || 1;
    if (shortPct > 0.2 || beta > 3) return "TIER 3";
    if (shortPct > 0.1 || beta > 2) return "TIER 2";
    return "TIER 1";
  }
}

// ── HQ API Integration ───────────────────────────────────────────────────────

async function postToHQ(results, summary) {
  const HQ_API_URL = process.env.HQ_API_URL || "https://claudiusinc.com";
  const HQ_API_KEY = process.env.HQ_API_KEY;

  if (!HQ_API_KEY) {
    console.log("HQ_API_KEY not set, skipping HQ upload");
    return false;
  }

  const payload = {
    scan_type: "unified",
    scanned_at: new Date().toISOString(),
    results,
    summary,
  };

  return new Promise((resolve) => {
    const u = new URL(`${HQ_API_URL}/api/stocks/scans`);
    const data = JSON.stringify(payload);

    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "x-api-key": HQ_API_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          console.log("Results uploaded to HQ");
          resolve(true);
        } else {
          console.log(`HQ upload failed: ${res.statusCode} - ${body}`);
          resolve(false);
        }
      });
    });

    req.on("error", (e) => {
      console.log(`HQ upload error: ${e.message}`);
      resolve(false);
    });

    req.write(data);
    req.end();
  });
}

function saveResultsToFile(results, summary) {
  const outputDir =
    process.env.SCAN_OUTPUT_DIR || path.join(__dirname, "../output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `unified-scan-${new Date().toISOString().split("T")[0]}.json`;
  const filepath = path.join(outputDir, filename);

  const output = {
    scan_type: "unified",
    scanned_at: new Date().toISOString(),
    results,
    summary,
  };

  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`Results saved to ${filepath}`);
  return filepath;
}

// ── Output formatting ────────────────────────────────────────────────────────

function formatMcap(mcapM) {
  if (mcapM >= 1000) return `${(mcapM / 1000).toFixed(1)}B`;
  return `${mcapM}M`;
}

function printReport(results, limit) {
  const top = results.slice(0, limit);
  const now = new Date().toISOString().split("T")[0];

  const usCount = results.filter((r) => r.market === "US").length;
  const sgxCount = results.filter((r) => r.market === "SGX").length;

  console.log("");
  console.log("=".repeat(150));
  console.log(" UNIFIED STOCK SCANNER");
  console.log(
    ` Date: ${now} | Universe: ${ALL_TICKERS.length} tickers (US: ${US_TICKERS.length}, SGX: ${SGX_TICKERS.length}) | Showing top ${limit}`,
  );
  console.log("=".repeat(150));

  // Summary by tier
  const highConviction = results.filter((r) => r.totalScore >= 70).length;
  const speculative = results.filter(
    (r) => r.totalScore >= 50 && r.totalScore < 70,
  ).length;
  const watchlist = results.filter(
    (r) => r.totalScore >= 35 && r.totalScore < 50,
  ).length;
  const avoid = results.filter((r) => r.totalScore < 35).length;
  console.log(
    `\n Summary: ${results.length} stocks scored (US: ${usCount}, SGX: ${sgxCount}) | HIGH CONVICTION: ${highConviction} | SPECULATIVE: ${speculative} | WATCHLIST: ${watchlist} | AVOID: ${avoid}`,
  );
  console.log("");

  // Table header
  const hdr = [
    "#".padStart(3),
    "Mkt".padEnd(3),
    "Ticker".padEnd(10),
    "Name".padEnd(25),
    "Score".padStart(5),
    "Grow".padStart(4),
    "Fin".padStart(4),
    "Ins".padStart(4),
    "Tech".padStart(4),
    "Anl".padStart(4),
    "Risk".padStart(5),
    "Tier".padEnd(16),
    "Price".padStart(7),
    "MCap".padStart(7),
  ].join(" | ");

  console.log("-".repeat(hdr.length));
  console.log(hdr);
  console.log("-".repeat(hdr.length));

  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    const row = [
      String(i + 1).padStart(3),
      r.market.padEnd(3),
      r.ticker.padEnd(10),
      r.name.substring(0, 25).padEnd(25),
      String(r.totalScore).padStart(5),
      String(r.growth.score).padStart(4),
      String(r.financial.score).padStart(4),
      String(r.insider.score).padStart(4),
      String(r.technical.score).padStart(4),
      String(r.analyst.score).padStart(4),
      String(r.risk.penalty).padStart(5),
      r.tier.padEnd(16),
      (r.price != null ? r.price.toFixed(2) : "-").padStart(7),
      formatMcap(parseFloat(r.mcapB) * 1000 || 0).padStart(7),
    ].join(" | ");
    console.log(row);
  }
  console.log("-".repeat(hdr.length));

  // Signal details for top 5
  console.log("\n-- Top 5 Details --");
  for (let i = 0; i < Math.min(5, top.length); i++) {
    const r = top[i];
    console.log(
      `  ${i + 1}. ${r.ticker} [${r.market}] (${r.name}) - Score: ${r.totalScore} [${r.tier}]`,
    );
    console.log(`     Growth: ${r.growth.details.join(", ")}`);
    console.log(`     Financial: ${r.financial.details.join(", ")}`);
    console.log(`     Insider: ${r.insider.details.join(", ")}`);
    console.log(`     Technical: ${r.technical.details.join(", ")}`);
    console.log(`     Analyst: ${r.analyst.details.join(", ")}`);
    if (r.risk.flags.length > 0)
      console.log(`     Risk: ${r.risk.flags.join(", ")}`);
  }
  console.log("");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit =
    limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : 40;
  const jsonMode = args.includes("--json");
  const uploadToHQ = args.includes("--upload") || args.includes("-u");
  const saveToFile = args.includes("--save") || args.includes("-s");

  process.stderr.write("Unified Stock Scanner\n");
  process.stderr.write("Initializing Yahoo Finance auth...\n");

  const ok = await initAuth();
  process.stderr.write(`Auth: ${ok ? "OK" : "FAILED"}\n`);
  if (!ok) {
    process.stderr.write("Auth failed. Exiting.\n");
    process.exit(1);
  }

  const results = [];
  let done = 0;
  const total = ALL_TICKERS.length;

  for (const ticker of ALL_TICKERS) {
    done++;
    const market = getMarket(ticker);
    try {
      const [chart, fund] = await Promise.all([
        getChartData(ticker),
        getFundamentals(ticker),
      ]);

      if (!chart || !fund) {
        process.stderr.write(`[${done}/${total}] X ${ticker}\n`);
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
      const riskTier = getRiskTier(fund, chart, market);

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
        revGrowth: fund.revenueGrowthRaw,
        grossMargin: fund.grossMargin,
      });

      process.stderr.write(
        `[${done}/${total}] ${tickerClean.padEnd(8)} [${market}] Score: ${totalScore} [${tier}]\n`,
      );
    } catch (e) {
      process.stderr.write(`[${done}/${total}] X ${ticker} (${e.message})\n`);
    }
    await delay(250);
  }

  // Sort by total score descending and assign ranks
  results.sort((a, b) => b.totalScore - a.totalScore);
  results.forEach((r, idx) => (r.rank = idx + 1));

  // Build summary
  const summary = {
    universeSize: ALL_TICKERS.length,
    scannedCount: results.length,
    highConviction: results.filter((r) => r.totalScore >= 70).length,
    speculative: results.filter((r) => r.totalScore >= 50 && r.totalScore < 70)
      .length,
    watchlist: results.filter((r) => r.totalScore >= 35 && r.totalScore < 50)
      .length,
    avoid: results.filter((r) => r.totalScore < 35).length,
    usCount: results.filter((r) => r.market === "US").length,
    sgxCount: results.filter((r) => r.market === "SGX").length,
  };

  if (jsonMode) {
    console.log(JSON.stringify({ results, summary }, null, 2));
  } else {
    printReport(results, limit);
  }

  if (saveToFile) {
    saveResultsToFile(results, summary);
  }

  if (uploadToHQ) {
    await postToHQ(results, summary);
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e.message}\n`);
  process.exit(1);
});
