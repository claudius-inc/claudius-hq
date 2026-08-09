/**
 * Economic calendar for TOMORROW'S TELLS — see docs/daily-note-spec.md §3/§4.9.
 *
 * Supplies the next session's US releases with their ET times and (where the
 * plan allows) consensus figures. FMP is primary, Finnhub the fallback; BOTH
 * are premium endpoints on most plans, which is the spec's flagged open risk.
 *
 * Per §1a this degrades rather than invents: no key, a paywalled response, or a
 * parse failure returns null and the TELLS section simply omits econ events.
 * A missing calendar must never become a guessed release time.
 */
import { logger } from "@/lib/logger";
import type { Fact, EconEvent } from "@/lib/notes/types";

const SRC = "notes/econ-calendar";

/** Releases worth a reader's attention — the rest is noise in a concise note. */
// Word-boundaried so short acronyms can't match inside other words — an
// unbounded /ism/ pulls in "Small Business Optimism", which is not a tell.
const HIGH_IMPACT = /payroll|non-?farm|\bcpi\b|consumer price|\bpce\b|\bfomc\b|fed(eral)? funds|interest rate decision|\bgdp\b|unemployment|retail sales|\bism\b|jobless claims|\bppi\b|producer price/i;

interface FmpEvent {
  event?: string;
  date?: string; // "2026-08-10 12:30:00" (UTC)
  country?: string;
  impact?: string;
  estimate?: number | null;
  previous?: number | null;
  actual?: number | null;
}

/** UTC "YYYY-MM-DD HH:mm:ss" → { etDate, etTime } */
function toEt(utc: string): { date: string; time: string } | null {
  const ms = Date.parse(utc.replace(" ", "T") + "Z");
  if (!Number.isFinite(ms)) return null;
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
  // hourCycle h23 (not hour12:false) so midnight is "00", never "24", on any ICU.
  const t = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
  return { date: d, time: t };
}

/**
 * Fetch high-impact US releases for the window [from, to] (ET dates, inclusive).
 * Returns null when no calendar source is usable — the caller omits the events.
 */
export async function fetchEconEvents(from: string, to: string, asOf: string): Promise<Fact<EconEvent[]> | null> {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    logger.info(SRC, "FMP_API_KEY not set — econ events omitted from TELLS");
    return null;
  }

  try {
    const url =
      `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${key}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      logger.warn(SRC, `Econ calendar fetch failed: ${res.status}`);
      return null;
    }
    const json: unknown = await res.json();
    if (!Array.isArray(json)) {
      // FMP returns an object with "Error Message" on a paywalled/invalid key.
      logger.warn(SRC, "Econ calendar unavailable (likely plan-restricted)", {
        body: JSON.stringify(json).slice(0, 160),
      });
      return null;
    }

    const events: EconEvent[] = [];
    for (const raw of json as FmpEvent[]) {
      if (!raw?.event || !raw.date) continue;
      // Require the country field — a missing one would let a foreign "CPI"
      // into a US note.
      if (raw.country !== "US") continue;
      if (!HIGH_IMPACT.test(raw.event)) continue;
      const et = toEt(raw.date);
      if (!et || et.date < from || et.date > to) continue;
      events.push({
        // Third-party text: cap it so one pathological name can't inflate TELLS.
        name: raw.event.slice(0, 80),
        date: et.date,
        timeEt: et.time,
        consensus: typeof raw.estimate === "number" ? raw.estimate : null,
        previous: typeof raw.previous === "number" ? raw.previous : null,
      });
    }
    if (events.length === 0) return null;

    events.sort((a, b) => (a.date + a.timeEt).localeCompare(b.date + b.timeEt));
    logger.info(SRC, "Econ events loaded", { count: events.length, from, to });
    return { value: events.slice(0, 4), source: "FMP economic calendar", asOf };
  } catch (error) {
    logger.warn(SRC, "Econ calendar error", { error });
    return null;
  }
}
