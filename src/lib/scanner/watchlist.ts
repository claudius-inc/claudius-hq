/**
 * Watchlist scoring + orchestration.
 *
 * Two pure scoring functions (scoreMomentum, scoreTechnical) and one
 * orchestrator (computeWatchlistScores) that fetches data and writes to DB.
 *
 * The pure functions are unit-tested with hand-built inputs.
 * The orchestrator is integration-tested against a mocked DB + Yahoo client.
 */

export interface ScoringInputs {
  price: number | null;

  // Momentum inputs
  return12mEx1m: number | null;          // decimal, e.g. 0.15 = +15%
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  closesAbove20SmaPct60d: number | null; // 0..1
  sma200: number | null;

  // Technical inputs
  sma50: number | null;
  sma20: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  avgVol20d: number | null;
  avgVol60d: number | null;
  adx14: number | null;
}

// ---------- Momentum ----------

// Momentum: 12-1M return, weight 40. Tiers: ≥30%→40, ≥15%→28, ≥0%→16, ≥-10%→8, else 0.
function score12mEx1m(r: number | null): number {
  if (r === null) return 0;
  if (r >= 0.30) return 40;
  if (r >= 0.15) return 28;
  if (r >= 0)    return 16;
  if (r >= -0.10) return 8;
  return 0;
}

// Momentum: 52w range position, weight 25. Scaled (price-low) / (high-low) to 0–25.
function score52wPosition(price: number | null, hi: number | null, lo: number | null): number {
  if (price === null || hi === null || lo === null || hi <= lo) return 0;
  const pos = Math.min(1, Math.max(0, (price - lo) / (hi - lo)));
  return Math.round(pos * 25);
}

// Momentum: Trend persistence, weight 20. % of 60d closes > 20-day SMA, scaled 0–20.
function scoreTrendPersistence(pct: number | null): number {
  if (pct === null) return 0;
  return Math.round(Math.min(1, Math.max(0, pct)) * 20);
}

// Momentum: Distance above 200-day SMA, weight 15. (price-SMA200)/SMA200 capped at +50%, maps 0–15.
function scoreDistAbove200(price: number | null, sma200: number | null): number {
  if (price === null || sma200 === null || sma200 === 0) return 0;
  const dist = (price - sma200) / sma200;
  if (dist <= 0) return 0;
  const capped = Math.min(0.50, dist);
  return Math.round((capped / 0.50) * 15);
}

export function scoreMomentum(i: ScoringInputs): number {
  return (
    score12mEx1m(i.return12mEx1m) +
    score52wPosition(i.price, i.fiftyTwoWeekHigh, i.fiftyTwoWeekLow) +
    scoreTrendPersistence(i.closesAbove20SmaPct60d) +
    scoreDistAbove200(i.price, i.sma200)
  );
}

// ---------- Technical ----------

// Technical: MA stack, weight 30. Tiers: 3 ordered (price > SMA20 > SMA50 > SMA200)→30, 2→20, 1→10, 0→0.
function scoreMaStack(p: number | null, s20: number | null, s50: number | null, s200: number | null): number {
  if (p === null || s20 === null || s50 === null || s200 === null) return 0;
  const pairs = [p > s20, s20 > s50, s50 > s200];
  const correct = pairs.filter(Boolean).length;
  if (correct === 3) return 30;
  if (correct === 2) return 20;
  if (correct === 1) return 10;
  return 0;
}

// Technical: RSI(14), weight 25. Tiers: 50–70→25, 40–50 or 70–75→18, 30–40 or 75–80→10, else 0.
function scoreRsi(rsi: number | null): number {
  if (rsi === null) return 0;
  if (rsi >= 50 && rsi <= 70) return 25;
  if ((rsi >= 40 && rsi < 50) || (rsi > 70 && rsi <= 75)) return 18;
  if ((rsi >= 30 && rsi < 40) || (rsi > 75 && rsi <= 80)) return 10;
  return 0;
}

// Technical: MACD, weight 20. Tiers: line > signal & line > 0→20, line > signal→12, line > 0→6, else 0.
function scoreMacd(line: number | null, signal: number | null): number {
  if (line === null || signal === null) return 0;
  if (line > signal && line > 0) return 20;
  if (line > signal) return 12;
  if (line > 0) return 6;
  return 0;
}

// Technical: Volume trend, weight 15. (avg20d/avg60d - 1). Tiers: ≥+30%→15, ≥+10%→10, ≥0→6, else 0.
function scoreVolumeTrend(v20: number | null, v60: number | null): number {
  if (v20 === null || v60 === null || v60 === 0) return 0;
  const change = v20 / v60 - 1;
  if (change >= 0.30) return 15;
  if (change >= 0.10) return 10;
  if (change >= 0)    return 6;
  return 0;
}

// Technical: ADX(14), weight 10. Tiers: ≥40→10, ≥25→7, ≥15→3, <15→0.
function scoreAdx(adx: number | null): number {
  if (adx === null) return 0;
  if (adx >= 40) return 10;
  if (adx >= 25) return 7;
  if (adx >= 15) return 3;
  return 0;
}

export function scoreTechnical(i: ScoringInputs): number {
  return (
    scoreMaStack(i.price, i.sma20, i.sma50, i.sma200) +
    scoreRsi(i.rsi14) +
    scoreMacd(i.macdLine, i.macdSignal) +
    scoreVolumeTrend(i.avgVol20d, i.avgVol60d) +
    scoreAdx(i.adx14)
  );
}

// ============================================================================
// Indicator helpers (computeIndicators is exported for watchlist-fetcher.ts)
// ============================================================================

import type { OHLCV } from "@/lib/scanner/indicators";
import type { NewWatchlistScore } from "@/db/schema";

interface ComputedIndicators {
  price: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  avgVol20d: number | null;
  avgVol60d: number | null;
  adx14: number | null;
  return12mEx1m: number | null;
  closesAbove20SmaPct60d: number | null;
}

function smaLast(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const slice = values.slice(values.length - n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

function smaSeries(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < n) { out.push(null); continue; }
    let sum = 0;
    for (let j = i + 1 - n; j <= i; j++) sum += values[j];
    out.push(sum / n);
  }
  return out;
}

// Wilder's RSI(14)
function calcRsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= 14; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff; else lossSum += -diff;
  }
  let avgGain = gainSum / 14;
  let avgLoss = lossSum / 14;
  for (let i = 15; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function emaSeries(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let ema = values[0];
  out.push(ema);
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function calcMacd(closes: number[]): { line: number | null; signal: number | null } {
  if (closes.length < 35) return { line: null, signal: null };
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdLine: number[] = closes.map((_, i) => ema12[i] - ema26[i]);
  // Start signal once MACD has 26 valid EMA points (index 25 onward)
  const signal = emaSeries(macdLine.slice(25), 9);
  return {
    line: macdLine[macdLine.length - 1],
    signal: signal[signal.length - 1],
  };
}

// Wilder's ADX(14)
function calcAdx14(highs: number[], lows: number[], closes: number[]): number | null {
  const n = 14;
  if (highs.length < n * 2) return null;
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const trVal = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    tr.push(trVal);
  }
  // Smooth using Wilder's method
  const wilder = (arr: number[], period: number): number[] => {
    const out: number[] = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    out.push(sum);
    for (let i = period; i < arr.length; i++) {
      sum = sum - sum / period + arr[i];
      out.push(sum);
    }
    return out;
  };
  const trSm = wilder(tr, n);
  const pdSm = wilder(plusDM, n);
  const mdSm = wilder(minusDM, n);
  const dx: number[] = [];
  for (let i = 0; i < trSm.length; i++) {
    const pdi = (pdSm[i] / trSm[i]) * 100;
    const mdi = (mdSm[i] / trSm[i]) * 100;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }
  if (dx.length < n) return null;
  // ADX = Wilder smoothing of DX
  let adxVal = dx.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < dx.length; i++) {
    adxVal = (adxVal * (n - 1) + dx[i]) / n;
  }
  return adxVal;
}

function calcReturn12mEx1m(closes: number[]): number | null {
  // Need at least 252 trading days. Anchor "ex-1m" at 21 days back.
  if (closes.length < 252) return null;
  const last21 = closes[closes.length - 1 - 21];
  const last252 = closes[closes.length - 1 - 252];
  if (!last21 || !last252 || last252 === 0) return null;
  return last21 / last252 - 1;
}

function calcClosesAbove20SmaPct(closes: number[], lookback: number): number | null {
  const sma20Series = smaSeries(closes, 20);
  if (closes.length < lookback + 20) return null;
  let count = 0;
  let total = 0;
  for (let i = closes.length - lookback; i < closes.length; i++) {
    const sma = sma20Series[i];
    if (sma === null) continue;
    total++;
    if (closes[i] > sma) count++;
  }
  return total > 0 ? count / total : null;
}

export function computeIndicators(bars: OHLCV[]): ComputedIndicators {
  const closes = bars.map((b) => b.close).filter((c): c is number => c !== null && c !== undefined);
  const highs = bars.map((b) => b.high).filter((c): c is number => c !== null && c !== undefined);
  const lows = bars.map((b) => b.low).filter((c): c is number => c !== null && c !== undefined);
  const vols = bars.map((b) => b.volume).filter((v): v is number => v !== null && v !== undefined);

  const macdRes = calcMacd(closes);

  return {
    price: closes.length > 0 ? closes[closes.length - 1] : null,
    sma20: smaLast(closes, 20),
    sma50: smaLast(closes, 50),
    sma200: smaLast(closes, 200),
    rsi14: calcRsi14(closes),
    macdLine: macdRes.line,
    macdSignal: macdRes.signal,
    avgVol20d: smaLast(vols, 20),
    avgVol60d: smaLast(vols, 60),
    adx14: calcAdx14(highs, lows, closes),
    return12mEx1m: calcReturn12mEx1m(closes),
    closesAbove20SmaPct60d: calcClosesAbove20SmaPct(closes, 60),
  };
}

// ============================================================================
// Orchestrator
// ============================================================================

export interface ComputeResult {
  tickersProcessed: number;
  okCount: number;
  partialCount: number;
  failedCount: number;
  allFailed: boolean;
}

function detectMarket(ticker: string): "US" | "SGX" | "HK" | "JP" {
  const t = ticker.toUpperCase();
  if (t.endsWith(".SI")) return "SGX";
  if (t.endsWith(".HK")) return "HK";
  if (t.endsWith(".T")) return "JP";
  return "US";
}

function classifyQuality(inputs: ScoringInputs | null): "ok" | "partial" | "failed" {
  if (inputs === null) return "failed";
  const required = [
    inputs.return12mEx1m, inputs.fiftyTwoWeekHigh, inputs.fiftyTwoWeekLow,
    inputs.closesAbove20SmaPct60d, inputs.sma200, inputs.sma50, inputs.sma20,
    inputs.rsi14, inputs.macdLine, inputs.macdSignal, inputs.avgVol20d,
    inputs.avgVol60d, inputs.adx14, inputs.price,
  ];
  return required.some((v) => v === null) ? "partial" : "ok";
}

export async function computeWatchlistScores(): Promise<ComputeResult> {
  // Dynamic imports so that @/db is not loaded at module parse time.
  // This keeps the pure scoring functions importable in unit tests without a DB.
  const [{ db, themeStocks, watchlistScores }, { logger }, { sql }, { buildScoringInputs }] =
    await Promise.all([
      import("@/db"),
      import("@/lib/logger"),
      import("drizzle-orm"),
      import("@/lib/scanner/watchlist-fetcher"),
    ]);

  const startedAt = new Date().toISOString();

  const rows = await db.select({ themeId: themeStocks.themeId, ticker: themeStocks.ticker }).from(themeStocks);

  const themesByTicker = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.ticker) continue;
    const arr = themesByTicker.get(r.ticker) ?? [];
    arr.push(r.themeId);
    themesByTicker.set(r.ticker, arr);
  }

  const tickers = Array.from(themesByTicker.keys());

  if (tickers.length === 0) {
    logger.info("watchlist", "No theme stocks tracked; skipping run");
    return { tickersProcessed: 0, okCount: 0, partialCount: 0, failedCount: 0, allFailed: false };
  }

  const newRows: NewWatchlistScore[] = [];
  let okCount = 0, partialCount = 0, failedCount = 0;

  for (const ticker of tickers) {
    const themeIds = themesByTicker.get(ticker) ?? [];
    let fetched: Awaited<ReturnType<typeof buildScoringInputs>> = null;

    try {
      fetched = await buildScoringInputs(ticker);
    } catch (err) {
      logger.warn("watchlist", `Fetch failed for ${ticker}`, { error: String(err) });
    }

    const quality = classifyQuality(fetched?.inputs ?? null);
    const momentum = fetched ? scoreMomentum(fetched.inputs) : null;
    const technical = fetched ? scoreTechnical(fetched.inputs) : null;

    if (quality === "ok") okCount++;
    else if (quality === "partial") partialCount++;
    else failedCount++;

    newRows.push({
      ticker,
      name: fetched?.name ?? ticker,
      market: detectMarket(ticker),
      price: fetched?.price ?? null,
      momentumScore: momentum,
      technicalScore: technical,
      priceChange1w: fetched?.pc1w ?? null,
      priceChange1m: fetched?.pc1m ?? null,
      priceChange3m: fetched?.pc3m ?? null,
      themeIds: JSON.stringify(themeIds.sort((a, b) => a - b)),
      dataQuality: quality,
      computedAt: startedAt,
    });
  }

  if (failedCount === tickers.length) {
    logger.error("watchlist", "Every ticker fetch failed; skipping DB write");
    return {
      tickersProcessed: tickers.length, okCount: 0, partialCount: 0, failedCount,
      allFailed: true,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(watchlistScores).where(
      sql`ticker NOT IN (${sql.join(tickers.map((t) => sql`${t}`), sql`, `)})`
    );
    for (const row of newRows) {
      await tx.insert(watchlistScores).values(row).onConflictDoUpdate({
        target: watchlistScores.ticker,
        set: {
          name: row.name,
          market: row.market,
          price: row.price,
          momentumScore: row.momentumScore,
          technicalScore: row.technicalScore,
          priceChange1w: row.priceChange1w,
          priceChange1m: row.priceChange1m,
          priceChange3m: row.priceChange3m,
          themeIds: row.themeIds,
          dataQuality: row.dataQuality,
          computedAt: row.computedAt,
        },
      });
    }
  });

  logger.info("watchlist", `Run complete: ${okCount} ok / ${partialCount} partial / ${failedCount} failed`);

  return {
    tickersProcessed: tickers.length,
    okCount, partialCount, failedCount,
    allFailed: false,
  };
}
