/**
 * Centralized date formatting utility for Claudius HQ
 * 
 * RULES:
 * 1. All dates in DB are stored as UTC (ISO strings or Unix timestamps)
 * 2. All dates displayed to user are converted to their local timezone
 * 3. Use formatDate() for all user-facing date displays
 * 
 * Standard format: "12 Feb, 10:42am"
 * With year (if different): "12 Feb 2025, 10:42am"
 */

export type DateFormatStyle = 'short' | 'long' | 'relative' | 'date-only' | 'time-only';

interface FormatDateOptions {
  style?: DateFormatStyle;
  includeYear?: boolean | 'auto'; // 'auto' = only show if different year
}

/**
 * Format a date for display in user's local timezone
 * 
 * @param date - Date object, ISO string, or Unix timestamp (ms)
 * @param options - Formatting options
 * @returns Formatted date string in user's local timezone
 * 
 * @example
 * formatDate('2026-02-15T02:42:00Z') // "15 Feb, 10:42am" (in SGT)
 * formatDate(new Date(), { style: 'relative' }) // "2 minutes ago"
 * formatDate('2026-02-15', { style: 'date-only' }) // "15 Feb"
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  options: FormatDateOptions = {}
): string {
  if (!date) return '—';

  const { style = 'short', includeYear = 'auto' } = options;

  // Parse the date
  let d: Date;
  if (typeof date === 'string') {
    // Handle ISO strings - append Z if no timezone specified
    if (!date.includes('Z') && !date.includes('+') && !date.includes('-', 10)) {
      d = new Date(date + 'Z');
    } else {
      d = new Date(date);
    }
  } else if (typeof date === 'number') {
    d = new Date(date);
  } else {
    d = date;
  }

  if (isNaN(d.getTime())) return '—';

  const now = new Date();
  const isCurrentYear = d.getFullYear() === now.getFullYear();
  const showYear = includeYear === true || (includeYear === 'auto' && !isCurrentYear);

  // Relative time formatting
  if (style === 'relative') {
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    // Fall through to short format for older dates
  }

  // Format components in user's local timezone
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const year = d.getFullYear();
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;

  // Build format based on style
  switch (style) {
    case 'date-only':
      return showYear ? `${day} ${month} ${year}` : `${day} ${month}`;
    
    case 'time-only':
      return `${hour12}:${minutes}${ampm}`;
    
    case 'long':
      return showYear 
        ? `${day} ${month} ${year}, ${hour12}:${minutes}${ampm}`
        : `${day} ${month}, ${hour12}:${minutes}${ampm}`;
    
    case 'relative':
    case 'short':
    default:
      return showYear 
        ? `${day} ${month} ${year}, ${hour12}:${minutes}${ampm}`
        : `${day} ${month}, ${hour12}:${minutes}${ampm}`;
  }
}

/**
 * Format a date for display in header/metadata contexts
 * Shows: "Updated: 15/02/2026, 10:42:45"
 */
export function formatTimestamp(date: Date | string | number | null | undefined): string {
  if (!date) return '—';

  let d: Date;
  if (typeof date === 'string') {
    if (!date.includes('Z') && !date.includes('+') && !date.includes('-', 10)) {
      d = new Date(date + 'Z');
    } else {
      d = new Date(date);
    }
  } else if (typeof date === 'number') {
    d = new Date(date);
  } else {
    d = date;
  }

  if (isNaN(d.getTime())) return '—';

  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');

  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
}

/**
 * Get current time formatted for display
 */
export function formatNow(options: FormatDateOptions = {}): string {
  return formatDate(new Date(), options);
}
