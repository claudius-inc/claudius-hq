/**
 * IPO Lockup Expiration Tracker for Scanner V2
 * Tracks lockup expiration dates (typically 180 days post-IPO).
 *
 * Lockup expirations can lead to significant selling pressure
 * as insiders and early investors gain the ability to sell shares.
 */

export interface LockupEvent {
  lockupExpiry: string | null; // ISO date string
  daysToExpiry: number | null;
  ipoDate: string | null;
  ipoPrice: number | null;
  lockupDays: number; // Typically 180
  percentLocked: number | null; // Percentage of shares under lockup
  notes?: string;
}

export interface LockupEntry {
  ticker: string;
  companyName: string;
  ipoDate: string; // YYYY-MM-DD
  ipoPrice: number;
  lockupDays: number; // Usually 180, sometimes 90 or 365
  lockupExpiry: string; // YYYY-MM-DD
  percentLocked?: number;
  notes?: string;
}

/**
 * Curated list of recent IPOs with lockup expiration tracking.
 * Updated periodically from IPO tracking sources.
 *
 * Sources:
 * - IPO Monitor
 * - SEC filings (S-1, prospectus)
 * - Financial news
 *
 * Last updated: 2026-03-26
 */
const LOCKUP_LIST: LockupEntry[] = [
  // Example entries - to be populated with real IPO data
  // {
  //   ticker: "EXAMPLE",
  //   companyName: "Example Corp",
  //   ipoDate: "2025-10-01",
  //   ipoPrice: 20.00,
  //   lockupDays: 180,
  //   lockupExpiry: "2026-03-30",
  //   percentLocked: 75,
  //   notes: "Major VC stake locked up"
  // },
];

/**
 * Calculate lockup expiry date from IPO date.
 */
function calculateLockupExpiry(ipoDate: string, lockupDays: number): string {
  const ipo = new Date(ipoDate);
  const expiry = new Date(ipo.getTime() + lockupDays * 24 * 60 * 60 * 1000);
  return expiry.toISOString().split("T")[0];
}

/**
 * Get lockup status for a specific ticker.
 */
export function getLockupStatus(ticker: string): LockupEvent {
  const normalizedTicker = ticker.toUpperCase();

  const entry = LOCKUP_LIST.find(
    (l) => l.ticker.toUpperCase() === normalizedTicker
  );

  if (!entry) {
    return {
      lockupExpiry: null,
      daysToExpiry: null,
      ipoDate: null,
      ipoPrice: null,
      lockupDays: 180,
      percentLocked: null,
    };
  }

  const today = new Date();
  const expiry = new Date(entry.lockupExpiry);
  const daysToExpiry = Math.ceil(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    lockupExpiry: entry.lockupExpiry,
    daysToExpiry: daysToExpiry > 0 ? daysToExpiry : 0,
    ipoDate: entry.ipoDate,
    ipoPrice: entry.ipoPrice,
    lockupDays: entry.lockupDays,
    percentLocked: entry.percentLocked ?? null,
    notes: entry.notes,
  };
}

/**
 * Get all upcoming lockup expirations within a given number of days.
 */
export function getUpcomingLockupExpirations(
  withinDays: number = 60
): LockupEntry[] {
  const today = new Date();
  const cutoff = new Date(today.getTime() + withinDays * 24 * 60 * 60 * 1000);

  return LOCKUP_LIST.filter((entry) => {
    const expiry = new Date(entry.lockupExpiry);
    return expiry >= today && expiry <= cutoff;
  }).sort(
    (a, b) =>
      new Date(a.lockupExpiry).getTime() - new Date(b.lockupExpiry).getTime()
  );
}

/**
 * Get recently expired lockups (last N days).
 * Useful for identifying stocks that recently had lockup expiry (potential selling pressure).
 */
export function getRecentLockupExpirations(withinDays: number = 30): LockupEntry[] {
  const today = new Date();
  const cutoff = new Date(today.getTime() - withinDays * 24 * 60 * 60 * 1000);

  return LOCKUP_LIST.filter((entry) => {
    const expiry = new Date(entry.lockupExpiry);
    return expiry >= cutoff && expiry <= today;
  }).sort(
    (a, b) =>
      new Date(b.lockupExpiry).getTime() - new Date(a.lockupExpiry).getTime()
  );
}

/**
 * Add an IPO/lockup entry programmatically.
 */
export function addLockupEntry(
  ticker: string,
  companyName: string,
  ipoDate: string,
  ipoPrice: number,
  lockupDays: number = 180,
  percentLocked?: number,
  notes?: string
): void {
  // Calculate expiry
  const lockupExpiry = calculateLockupExpiry(ipoDate, lockupDays);

  // Avoid duplicates
  const exists = LOCKUP_LIST.some(
    (l) => l.ticker.toUpperCase() === ticker.toUpperCase()
  );

  if (!exists) {
    LOCKUP_LIST.push({
      ticker: ticker.toUpperCase(),
      companyName,
      ipoDate,
      ipoPrice,
      lockupDays,
      lockupExpiry,
      percentLocked,
      notes,
    });
  }
}

/**
 * Update lockup entry (e.g., if lockup period is extended).
 */
export function updateLockupEntry(
  ticker: string,
  updates: Partial<Omit<LockupEntry, "ticker">>
): boolean {
  const entry = LOCKUP_LIST.find(
    (l) => l.ticker.toUpperCase() === ticker.toUpperCase()
  );

  if (!entry) return false;

  Object.assign(entry, updates);

  // Recalculate expiry if IPO date or lockup days changed
  if (updates.ipoDate || updates.lockupDays) {
    entry.lockupExpiry = calculateLockupExpiry(
      entry.ipoDate,
      entry.lockupDays
    );
  }

  return true;
}

/**
 * Remove a ticker from the lockup list.
 */
export function removeLockupEntry(ticker: string): boolean {
  const index = LOCKUP_LIST.findIndex(
    (l) => l.ticker.toUpperCase() === ticker.toUpperCase()
  );

  if (index >= 0) {
    LOCKUP_LIST.splice(index, 1);
    return true;
  }

  return false;
}

/**
 * Check if a stock has an upcoming lockup expiry within N days.
 * Useful as a risk flag.
 */
export function hasUpcomingLockupExpiry(
  ticker: string,
  withinDays: number = 30
): boolean {
  const status = getLockupStatus(ticker);
  return (
    status.daysToExpiry !== null &&
    status.daysToExpiry > 0 &&
    status.daysToExpiry <= withinDays
  );
}

/**
 * Get IPO performance since listing.
 * Compares current price to IPO price.
 */
export function getIPOPerformance(
  ticker: string,
  currentPrice: number
): { percentChange: number; isAboveIPO: boolean } | null {
  const entry = LOCKUP_LIST.find(
    (l) => l.ticker.toUpperCase() === ticker.toUpperCase()
  );

  if (!entry || !entry.ipoPrice) return null;

  const percentChange = ((currentPrice - entry.ipoPrice) / entry.ipoPrice) * 100;

  return {
    percentChange,
    isAboveIPO: currentPrice > entry.ipoPrice,
  };
}
