/**
 * Indicator helpers for watchlist scoring.
 *
 * Extracted from watchlist.ts so that watchlist-fetcher.ts can import
 * computeIndicators without creating a circular dependency through watchlist.ts.
 *
 * Dependency graph (no cycles):
 *   watchlist-indicators  ← watchlist-fetcher ← watchlist-orchestrator
 *   watchlist             ← watchlist-orchestrator
 */

import type { OHLCV } from "@/lib/scanner/indicators";

export interface ComputedIndicators {
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
  // Need at least 253 bars to access closes[length-1-252] (the 252-day anchor)
  // and closes[length-1-21] (the ex-1m anchor). With a 14-month Yahoo window
  // (~295 bars), this is reliably satisfied.
  if (closes.length < 253) return null;
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
