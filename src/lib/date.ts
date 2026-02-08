/**
 * Date utilities for Claudius HQ
 * 
 * SQLite/Turso stores datetimes as UTC without timezone suffix.
 * These utilities ensure correct parsing and display in user's local timezone.
 */

/**
 * Parse a database datetime string (UTC without 'Z') into a Date object
 */
export function parseDbDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  // DB stores UTC without 'Z' suffix - append it for correct parsing
  const utcDateStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
  return new Date(utcDateStr);
}

/**
 * Format a database datetime as a short date (e.g., "Feb 8, 2026")
 */
export function formatDate(dateStr: string | null | undefined): string {
  const date = parseDbDate(dateStr);
  if (!date) return "-";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a database datetime as full timestamp (e.g., "8 Feb 2026, 10:30 AM")
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  const date = parseDbDate(dateStr);
  if (!date) return "-";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a database datetime as relative time (e.g., "5m ago", "2h ago")
 */
export function formatTimeAgo(dateStr: string | null | undefined): string {
  const date = parseDbDate(dateStr);
  if (!date) return "-";
  
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 0) return 'just now'; // Handle clock skew
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
