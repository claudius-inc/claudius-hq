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

function score12mEx1m(r: number | null): number {
  if (r === null) return 0;
  if (r >= 0.30) return 40;
  if (r >= 0.15) return 28;
  if (r >= 0)    return 16;
  if (r >= -0.10) return 8;
  return 0;
}

function score52wPosition(price: number | null, hi: number | null, lo: number | null): number {
  if (price === null || hi === null || lo === null || hi <= lo) return 0;
  const pos = Math.min(1, Math.max(0, (price - lo) / (hi - lo)));
  return Math.round(pos * 25);
}

function scoreTrendPersistence(pct: number | null): number {
  if (pct === null) return 0;
  return Math.round(Math.min(1, Math.max(0, pct)) * 20);
}

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

function scoreMaStack(p: number | null, s20: number | null, s50: number | null, s200: number | null): number {
  if (p === null || s20 === null || s50 === null || s200 === null) return 0;
  const pairs = [p > s20, s20 > s50, s50 > s200];
  const correct = pairs.filter(Boolean).length;
  if (correct === 3) return 30;
  if (correct === 2) return 20;
  if (correct === 1) return 10;
  return 0;
}

function scoreRsi(rsi: number | null): number {
  if (rsi === null) return 0;
  if (rsi >= 50 && rsi <= 70) return 25;
  if ((rsi >= 40 && rsi < 50) || (rsi > 70 && rsi <= 75)) return 18;
  if ((rsi >= 30 && rsi < 40) || (rsi > 75 && rsi <= 80)) return 10;
  return 0;
}

function scoreMacd(line: number | null, signal: number | null): number {
  if (line === null || signal === null) return 0;
  if (line > signal && line > 0) return 20;
  if (line > signal) return 12;
  if (line > 0) return 6;
  return 0;
}

function scoreVolumeTrend(v20: number | null, v60: number | null): number {
  if (v20 === null || v60 === null || v60 === 0) return 0;
  const change = v20 / v60 - 1;
  if (change >= 0.30) return 15;
  if (change >= 0.10) return 10;
  if (change >= 0)    return 6;
  return 0;
}

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
