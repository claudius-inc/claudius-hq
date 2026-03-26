/**
 * Spinoff Tracker for Scanner V2
 * Tracks upcoming and recent corporate spinoffs.
 *
 * Primary focus: US market (SEC Form 10-12B filings)
 * Future enhancement: SEC EDGAR API integration
 */

export interface SpinoffEvent {
  isSpinoff: boolean;
  spinoffDate: string | null; // ISO date string
  parentCompany: string | null;
  status: "announced" | "pending" | "completed" | "cancelled" | null;
  daysToSpinoff: number | null;
  spunOffCompany?: string | null;
  notes?: string;
}

export interface SpinoffEntry {
  ticker: string;
  parentTicker: string;
  parentName: string;
  spinoffDate: string; // YYYY-MM-DD
  status: "announced" | "pending" | "completed";
  notes?: string;
}

/**
 * Curated list of upcoming/recent spinoffs.
 * Updated periodically from financial news sources.
 *
 * Sources:
 * - stockspinoffinvesting.com
 * - SEC EDGAR Form 10-12B filings
 * - Financial news (Bloomberg, Reuters)
 *
 * Last updated: 2026-03-26
 */
const SPINOFF_LIST: SpinoffEntry[] = [
  // Example entries - to be populated with real data
  // {
  //   ticker: "XYZ",
  //   parentTicker: "ABC",
  //   parentName: "ABC Corporation",
  //   spinoffDate: "2026-04-15",
  //   status: "pending",
  //   notes: "Healthcare division spinoff"
  // },
];

/**
 * Check if a ticker is involved in a spinoff (as parent or child).
 */
export function getSpinoffStatus(ticker: string): SpinoffEvent {
  const normalizedTicker = ticker.toUpperCase().replace(".US", "");

  // Check if ticker is being spun off
  const asChild = SPINOFF_LIST.find(
    (s) => s.ticker.toUpperCase() === normalizedTicker
  );
  if (asChild) {
    const spinoffDate = new Date(asChild.spinoffDate);
    const today = new Date();
    const daysToSpinoff = Math.ceil(
      (spinoffDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      isSpinoff: true,
      spinoffDate: asChild.spinoffDate,
      parentCompany: asChild.parentName,
      status: asChild.status,
      daysToSpinoff: daysToSpinoff > 0 ? daysToSpinoff : null,
      notes: asChild.notes,
    };
  }

  // Check if ticker is a parent company spinning off
  const asParent = SPINOFF_LIST.find(
    (s) => s.parentTicker.toUpperCase() === normalizedTicker
  );
  if (asParent) {
    const spinoffDate = new Date(asParent.spinoffDate);
    const today = new Date();
    const daysToSpinoff = Math.ceil(
      (spinoffDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      isSpinoff: true,
      spinoffDate: asParent.spinoffDate,
      parentCompany: null,
      spunOffCompany: asParent.ticker,
      status: asParent.status,
      daysToSpinoff: daysToSpinoff > 0 ? daysToSpinoff : null,
      notes: `Spinning off ${asParent.ticker}. ${asParent.notes || ""}`,
    };
  }

  return {
    isSpinoff: false,
    spinoffDate: null,
    parentCompany: null,
    status: null,
    daysToSpinoff: null,
  };
}

/**
 * Get all upcoming spinoffs within a given number of days.
 */
export function getUpcomingSpinoffs(
  withinDays: number = 90
): SpinoffEntry[] {
  const today = new Date();
  const cutoff = new Date(today.getTime() + withinDays * 24 * 60 * 60 * 1000);

  return SPINOFF_LIST.filter((s) => {
    if (s.status === "completed") return false;
    const spinoffDate = new Date(s.spinoffDate);
    return spinoffDate >= today && spinoffDate <= cutoff;
  }).sort(
    (a, b) => new Date(a.spinoffDate).getTime() - new Date(b.spinoffDate).getTime()
  );
}

/**
 * Get recently completed spinoffs (last N days).
 */
export function getRecentSpinoffs(withinDays: number = 30): SpinoffEntry[] {
  const today = new Date();
  const cutoff = new Date(today.getTime() - withinDays * 24 * 60 * 60 * 1000);

  return SPINOFF_LIST.filter((s) => {
    if (s.status !== "completed") return false;
    const spinoffDate = new Date(s.spinoffDate);
    return spinoffDate >= cutoff && spinoffDate <= today;
  }).sort(
    (a, b) => new Date(b.spinoffDate).getTime() - new Date(a.spinoffDate).getTime()
  );
}

/**
 * Add a spinoff entry programmatically.
 * Useful for populating from external sources.
 */
export function addSpinoffEntry(entry: SpinoffEntry): void {
  // Avoid duplicates
  const exists = SPINOFF_LIST.some(
    (s) =>
      s.ticker === entry.ticker &&
      s.parentTicker === entry.parentTicker &&
      s.spinoffDate === entry.spinoffDate
  );
  if (!exists) {
    SPINOFF_LIST.push(entry);
  }
}

/**
 * Update spinoff status (e.g., mark as completed).
 */
export function updateSpinoffStatus(
  ticker: string,
  status: SpinoffEntry["status"]
): boolean {
  const entry = SPINOFF_LIST.find(
    (s) => s.ticker.toUpperCase() === ticker.toUpperCase()
  );
  if (entry) {
    entry.status = status;
    return true;
  }
  return false;
}
