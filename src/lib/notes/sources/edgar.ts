/**
 * SEC EDGAR 8-K filings — rung 4 of the §B attribution ladder.
 *
 * The rung exists for the days the other rungs cannot explain: an acquisition
 * completing, a CEO leaving, a listing-rule notice. Those move a stock hard and
 * leave no trace in earnings history or the analyst tape, so without this rung
 * the correct output is a bare mover line — accurate, but less than we can do
 * for free.
 *
 * Shape verified against the live API rather than assumed:
 *   company_tickers.json → { cik_str, ticker, title }, ~10,400 entries
 *   submissions/CIK##########.json → filings.recent, PARALLEL ARRAYS where
 *   `items` is a comma-separated string ("2.02,9.01") and `acceptanceDateTime`
 *   is ISO with a Z suffix ("2026-08-06T20:07:38.000Z").
 *
 * Two SEC rules are mandatory, not advisory: a declared User-Agent identifying
 * the requester, and no more than 10 requests a second. Both are enforced here.
 */
import { logger } from "@/lib/logger";
import { etDate, etMinutes } from "@/lib/notes/session";

const SRC = "notes/edgar";

/**
 * SEC requires a User-Agent that identifies the requester and offers a way to
 * contact them; anonymous or spoofed agents get blocked. Overridable so the
 * address can be changed without a deploy, but never absent.
 */
const USER_AGENT = process.env.SEC_EDGAR_USER_AGENT || "claudius-hq daily-note (manapixels@gmail.com)";

/** SEC caps at 10 requests/second. Stay comfortably under it. */
const MIN_REQUEST_GAP_MS = 120;
let lastRequestAt = 0;

/**
 * 8-K item codes worth attributing to, most significant first, each with the
 * phrase that describes it.
 *
 * **The phrase names the filing category, not an inferred event.** The feed
 * gives a bare code with no sub-paragraph, and several codes span routine and
 * dramatic filings alike: 5.02 covers a CEO resigning (b) AND the annual
 * director election (d) AND this year's compensation grants (e). Calling that
 * "a leadership change" would be true a fraction of the time and would read, on
 * every other day, as a fabricated reason for the move. "Officers or directors"
 * says exactly what the filing was about and nothing more — the two-verb rule
 * protects the causality, and this protects the description.
 *
 * 5.02 is ranked below the unambiguous codes for the same reason: it is the
 * highest-volume item of the set and the least specific, so it should only win
 * when nothing sharper is on the filing.
 *
 * 7.01 (Reg FD) and 8.01 (Other Events) are deliberately absent: catch-alls
 * attached to filings about anything at all, so "an 8-K on other events" would
 * assert a cause while carrying no information. 9.01 (Exhibits) rides along on
 * almost every 8-K and is not an event.
 *
 * One ordered list, not a list plus a lookup table: two structures that must
 * agree is how a code ends up with a phrase and no membership, or the reverse.
 */
const CAUSAL_ITEMS: { code: string; what: string }[] = [
  { code: "2.01", what: "a completed acquisition or disposal" },
  { code: "1.02", what: "a terminated material agreement" },
  { code: "3.01", what: "a listing notice" },
  { code: "5.02", what: "officers or directors" },
  { code: "1.01", what: "a material agreement" },
  // Last: rung 1 owns earnings. This only fires on a day rung 1 never engaged,
  // where an accepted 8-K item 2.02 is a STRONGER confirmation than the
  // calendar rung 1 trusts — so it degrades from EPS numerals to a category,
  // which is the right direction.
  { code: "2.02", what: "a results release" },
];

export interface EightK {
  ticker: string;
  /** The item code the phrase is built from. */
  item: string;
  /** Human phrase for that code, e.g. "a leadership change". */
  what: string;
  acceptedAtMs: number;
}

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    await throttle();
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      logger.warn(SRC, `EDGAR request failed: ${res.status}`, { url });
      return null;
    }
    return (await res.json()) as T;
  } catch (error) {
    logger.warn(SRC, "EDGAR request error", { url, error });
    return null;
  }
}

/**
 * Ticker → zero-padded CIK, fetched once per run.
 *
 * EDGAR writes share classes with a dash (BRK-B) where the SPDR holdings files
 * use a dot, so both spellings are indexed and the caller does not have to know
 * which convention it holds.
 */
export async function fetchCikMap(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const json = await getJson<Record<string, { cik_str: number; ticker: string }>>(
    "https://www.sec.gov/files/company_tickers.json",
  );
  if (!json) return out;
  for (const row of Object.values(json)) {
    if (!row?.ticker || row.cik_str == null) continue;
    const cik = String(row.cik_str).padStart(10, "0");
    const t = row.ticker.toUpperCase();
    out.set(t, cik);
    out.set(t.replace(/-/g, "."), cik);
  }
  logger.info(SRC, "CIK map loaded", { tickers: out.size });
  return out;
}

interface RecentFilings {
  form?: string[];
  items?: string[];
  acceptanceDateTime?: string[];
}

/**
 * The most significant causal 8-K filed in the window that could have moved
 * TODAY's regular session, or null.
 *
 * **The window is (prior session's close, today's close]**, which is the §B
 * specification and is not the same as "today". A same-day-only window has a
 * hole exactly where this rung's best material lives: deal closings and CEO
 * departures are overwhelmingly announced after the bell, precisely so the
 * market has overnight to digest them. Those filings move the NEXT session, and
 * under a same-day rule no note would ever claim them — yesterday's run
 * excludes them as post-close, today's as the wrong date. On a Monday that hole
 * is roughly 56 hours wide.
 *
 * It is expressed in SESSIONS rather than "since the last run" on purpose. The
 * workflow fires twice an evening and the second run edits the message the first
 * one sent; a wall-clock window would let the two disagree, so the edited note
 * would change content for no market reason. Session boundaries make both runs
 * compute the same answer.
 *
 * The upper bound is STRICT. `etMinutes` truncates seconds, so `<= closeMinute`
 * would admit everything up to 16:00:59 — filings accepted after the bell, and
 * 16:00-16:01 is a real clustering point for results releases.
 *
 * `8-K/A` is excluded: an amendment re-files old news, and its acceptance stamp
 * would attach today's move to an event from weeks ago.
 */
export async function fetchCausalEightK(
  ticker: string,
  cik: string,
  marketDate: string,
  priorSessionDate: string | null,
  closeMinute: number,
): Promise<EightK | null> {
  const json = await getJson<{ filings?: { recent?: RecentFilings } }>(
    `https://data.sec.gov/submissions/CIK${cik}.json`,
  );
  const recent = json?.filings?.recent;
  if (!recent?.form || !recent.acceptanceDateTime) return null;

  const found: EightK[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    // Exact match: "8-K/A" is an amendment, not the event.
    if (recent.form[i] !== "8-K") continue;
    const ms = Date.parse(recent.acceptanceDateTime[i] ?? "");
    if (!Number.isFinite(ms)) continue;
    if (!inReactionWindow(ms, marketDate, priorSessionDate, closeMinute)) continue;

    // `items` is a comma-separated string; a filing usually carries several.
    const items = (recent.items?.[i] ?? "").split(",").map((s) => s.trim());
    const rank = CAUSAL_ITEMS.findIndex((c) => items.includes(c.code));
    if (rank < 0) continue;
    found.push({ ticker, item: CAUSAL_ITEMS[rank].code, what: CAUSAL_ITEMS[rank].what, acceptedAtMs: ms });
  }

  if (found.length === 0) return null;
  // One cause per ticker: the most significant item across the window.
  const rankOf = (e: EightK) => CAUSAL_ITEMS.findIndex((c) => c.code === e.item);
  found.sort((a, b) => rankOf(a) - rankOf(b));
  return found[0];
}

/**
 * Could an event at `ms` have moved today's regular session?
 *
 * Two bands, mirroring the earnings session-half table: after the previous
 * session's close (overnight news the market opens on), or during today up to
 * the bell. Anything after today's close belongs to tomorrow's note.
 */
export function inReactionWindow(
  ms: number,
  marketDate: string,
  priorSessionDate: string | null,
  closeMinute: number,
): boolean {
  const day = etDate(ms);
  const minute = etMinutes(ms);
  if (day === marketDate) return minute < closeMinute;
  if (priorSessionDate && day === priorSessionDate) return minute >= closeMinute;
  return false;
}
