/**
 * Technical indicator calculations for the stock scanner.
 * All functions operate on OHLC data arrays (oldest first).
 */

export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: Date;
}

/**
 * Calculate True Range for a single bar.
 * TR = max(high - low, |high - prevClose|, |low - prevClose|)
 */
export function trueRange(
  high: number,
  low: number,
  prevClose: number | null
): number {
  const hl = high - low;
  if (prevClose === null) return hl;
  return Math.max(hl, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

/**
 * Calculate Average True Range (ATR) over N periods.
 * Uses Simple Moving Average of True Range.
 */
export function calculateATR(data: OHLCV[], period: number = 14): number | null {
  if (data.length < period + 1) return null;

  const trValues: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const tr = trueRange(data[i].high, data[i].low, data[i - 1].close);
    trValues.push(tr);
  }

  if (trValues.length < period) return null;

  // SMA of last `period` TRs
  const recentTR = trValues.slice(-period);
  const atr = recentTR.reduce((sum, v) => sum + v, 0) / period;
  return atr;
}

/**
 * Calculate All-Time High from OHLC data.
 * Returns the maximum high price in the dataset.
 */
export function calculateATH(data: OHLCV[]): number | null {
  if (data.length === 0) return null;
  return Math.max(...data.map((bar) => bar.high));
}

/**
 * Calculate Relative Volume (RVOL).
 * RVOL = currentVolume / avgVolume(lookback)
 */
export function calculateRVOL(
  data: OHLCV[],
  lookback: number = 10
): number | null {
  if (data.length < lookback + 1) return null;

  const currentVolume = data[data.length - 1].volume;
  const avgVolume =
    data
      .slice(-lookback - 1, -1)
      .reduce((sum, bar) => sum + bar.volume, 0) / lookback;

  if (avgVolume === 0) return null;
  return currentVolume / avgVolume;
}

/**
 * Find swing low in the data.
 * Simple implementation: lowest low in last N bars.
 */
export function findSwingLow(data: OHLCV[], lookback: number = 20): number | null {
  if (data.length < lookback) return null;
  const recent = data.slice(-lookback);
  return Math.min(...recent.map((bar) => bar.low));
}

/**
 * Calculate Risk/Reward ratio.
 * RR = (ATH - currentPrice) / (currentPrice - swingLow)
 * Higher RR means more potential upside relative to downside risk.
 */
export function calculateRR(
  currentPrice: number,
  ath: number,
  swingLow: number
): number | null {
  if (currentPrice <= swingLow || currentPrice >= ath) return null;
  const upside = ath - currentPrice;
  const downside = currentPrice - swingLow;
  if (downside === 0) return null;
  return upside / downside;
}

/**
 * Aggregate weekly OHLCV data from daily data.
 * Each week runs Monday-Friday; partial weeks are included.
 */
export function aggregateToWeekly(daily: OHLCV[]): OHLCV[] {
  if (daily.length === 0) return [];

  const weeks: OHLCV[] = [];
  let weekStart: Date | null = null;
  let weekData: OHLCV = {
    open: 0,
    high: -Infinity,
    low: Infinity,
    close: 0,
    volume: 0,
    date: new Date(),
  };

  for (const bar of daily) {
    const dow = bar.date.getDay();
    const isNewWeek = weekStart === null || dow === 1 || bar.date.getTime() - weekStart.getTime() > 7 * 24 * 60 * 60 * 1000;

    if (isNewWeek && weekStart !== null) {
      weeks.push({ ...weekData });
      weekData = {
        open: 0,
        high: -Infinity,
        low: Infinity,
        close: 0,
        volume: 0,
        date: new Date(),
      };
    }

    if (weekData.open === 0) {
      weekData.open = bar.open;
      weekData.date = bar.date;
    }
    weekData.high = Math.max(weekData.high, bar.high);
    weekData.low = Math.min(weekData.low, bar.low);
    weekData.close = bar.close;
    weekData.volume += bar.volume;
    weekStart = bar.date;
  }

  // Push final week
  if (weekData.open !== 0) {
    weeks.push({ ...weekData });
  }

  return weeks;
}

/**
 * Aggregate monthly OHLCV data from daily data.
 */
export function aggregateToMonthly(daily: OHLCV[]): OHLCV[] {
  if (daily.length === 0) return [];

  const months: OHLCV[] = [];
  let currentMonth: number | null = null;
  let currentYear: number | null = null;
  let monthData: OHLCV = {
    open: 0,
    high: -Infinity,
    low: Infinity,
    close: 0,
    volume: 0,
    date: new Date(),
  };

  for (const bar of daily) {
    const month = bar.date.getMonth();
    const year = bar.date.getFullYear();
    const isNewMonth = currentMonth === null || month !== currentMonth || year !== currentYear;

    if (isNewMonth && currentMonth !== null) {
      months.push({ ...monthData });
      monthData = {
        open: 0,
        high: -Infinity,
        low: Infinity,
        close: 0,
        volume: 0,
        date: new Date(),
      };
    }

    if (monthData.open === 0) {
      monthData.open = bar.open;
      monthData.date = bar.date;
    }
    monthData.high = Math.max(monthData.high, bar.high);
    monthData.low = Math.min(monthData.low, bar.low);
    monthData.close = bar.close;
    monthData.volume += bar.volume;
    currentMonth = month;
    currentYear = year;
  }

  // Push final month
  if (monthData.open !== 0) {
    months.push({ ...monthData });
  }

  return months;
}
