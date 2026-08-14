/**
 * Street consensus for economic releases — see
 * docs/implementation-plans/2026-08-13-tape-accuracy.md Part D.
 *
 * The v2 spec's §I recorded "no free consensus feed exists" as settled. It was
 * wrong. `api.nasdaq.com/api/calendar/economicevents` serves actual, consensus and
 * previous for every calendar event, with no key and no auth, and it publishes the
 * consensus BEFORE the release — which is what makes the forward calendar useful
 * rather than a list of times.
 *
 * It is Investing.com's calendar resold, so it is A survey median, not THE street
 * number. Bloomberg's and Reuters' will differ. Attribution is mandatory wherever
 * the figure is printed.
 *
 * Three properties were measured on 2026-08-14 and every one of them is a trap for
 * a future maintainer:
 *
 *  1. **The `date` parameter is the true ET release date PLUS ONE.** Verified
 *     against FRED on four consecutive releases — CPI printed 08-12 and sits in the
 *     08-13 bucket; retail sales printed Friday 08-14 and sits in the SATURDAY
 *     08-15 bucket, which is proof on its own that the field is not a release date.
 *  2. **Event names are ambiguous.** Two rows are both called "CPI" at the same
 *     minute, one m/m and one y/y, and the payload has seven keys, none of which
 *     separates them. See `matchRow` — the join is on the prior value.
 *  3. **The endpoint hangs rather than 403s** on bare requests from datacentre IPs,
 *     and GitHub runners are the canonical blocked class. Hence browser headers and
 *     a hard AbortController timeout: a consensus that never arrives must cost the
 *     consensus line, never the twelve-minute job budget.
 */
import { logger } from "@/lib/logger";
import type { ConnectorHealth } from "@/lib/notes/health";

const SRC = "notes/nasdaq-consensus";
const BASE = "https://api.nasdaq.com/api/calendar/economicevents";

/**
 * Nasdaq buckets an event one calendar day AFTER its true ET release date.
 *
 * Measured, not assumed:
 *
 *   CPI            FRED 2026-08-12  ->  bucket 2026-08-13
 *   PPI            FRED 2026-08-13  ->  bucket 2026-08-14
 *   Jobless claims FRED 2026-08-13  ->  bucket 2026-08-14
 *   Retail sales   FRED 2026-08-14  ->  bucket 2026-08-15  (a Saturday)
 *
 * This is an accident of Nasdaq's pipeline and not a contract, so
 * `fetchConsensus` asserts it at runtime rather than trusting it forever.
 * Deriving the date from each row's own `gmt` field does NOT work — `gmt` carries
 * a time and no date, so it cannot say which day a row belongs to.
 */
const BUCKET_OFFSET_DAYS = 1;

/** The endpoint hangs on unadorned requests; 10s is well past its healthy latency. */
const TIMEOUT_MS = 10_000;

export interface CalendarRow {
  eventName: string;
  /** ET wall clock despite the field name, e.g. "08:30". */
  timeEt: string;
  actual: number | null;
  consensus: number | null;
  previous: number | null;
}

interface RawRow {
  gmt?: string;
  country?: string;
  eventName?: string;
  actual?: string;
  consensus?: string;
  previous?: string;
}

/** The bucket a release on `etDate` will be filed under. */
export function bucketFor(etDate: string): string {
  const t = Date.parse(`${etDate}T12:00:00Z`);
  if (!Number.isFinite(t)) return etDate;
  return new Date(t + BUCKET_OFFSET_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/**
 * "0.1%" -> 0.1, "209K" -> 209, "1,777K" -> 1777, "&nbsp;" -> null.
 *
 * The K suffix is NOT expanded. FRED's own `scale` already puts claims and payrolls
 * in thousands, so "209K" and FRED's 209 are the same number in the same units, and
 * expanding here would break the join it exists to serve.
 */
export function parseFigure(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/&nbsp;?/gi, " ").replace(/[,%\s]/g, "").replace(/[KMB]$/i, "");
  if (!s || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function getRows(bucket: string): Promise<RawRow[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}?date=${bucket}`, {
      signal: controller.signal,
      cache: "no-store",
      // Without these the endpoint hangs rather than refusing, which is worse.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
    });
    if (!res.ok) {
      logger.warn(SRC, `Nasdaq calendar returned ${res.status}`, { bucket });
      return null;
    }
    const json = (await res.json()) as { data?: { rows?: RawRow[] } };
    return json?.data?.rows ?? [];
  } catch (error) {
    logger.warn(SRC, "Nasdaq calendar request failed", { bucket, error });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface ConsensusFetch {
  /** Null when the request failed. Empty array when it answered with nothing. */
  rows: CalendarRow[] | null;
  bucket: string;
}

/** US rows for the session that took place on `etDate`. */
export async function fetchConsensus(etDate: string): Promise<ConsensusFetch> {
  const bucket = bucketFor(etDate);
  const raw = await getRows(bucket);
  if (raw == null) return { rows: null, bucket };

  const rows = raw
    .filter((r) => r.country === "United States" && r.eventName)
    .map((r) => ({
      eventName: String(r.eventName).trim(),
      timeEt: String(r.gmt ?? "").trim(),
      actual: parseFigure(r.actual),
      consensus: parseFigure(r.consensus),
      previous: parseFigure(r.previous),
    }));
  logger.info(SRC, "Nasdaq calendar loaded", { bucket, rows: rows.length });
  return { rows, bucket };
}

/**
 * Find the one row that is this release, or nothing.
 *
 * The join is on the PRIOR VALUE, and the rule is UNIQUE MATCH: scan every row
 * whose name matches and require that exactly one has a `previous` equal to the
 * prior we already hold from FRED. Zero matches or two matches means no consensus.
 * Never first-match-wins.
 *
 * That rule is what makes this safe, and it does not depend on any publishing
 * convention holding. Measured on six series, both fields, exactly:
 *
 *   CPI y/y   3.4 / 3.5   = CPIAUCNS pc1      CPI m/m  0.1 / -0.4  = CPIAUCSL pch
 *   PPI y/y   4.7 / 5.5   = PPIFID pc1        claims   209 / 200   = ICSA lin
 *   payrolls  -23 / 20    = PAYEMS chg        u-rate   4.1 / 4.2   = UNRATE lin
 *
 * Nasdaq's `previous` is the CURRENT vintage, not the first print — the prior is
 * revised by the same release that publishes the new figure, so the calendar shows
 * the revised one, which is exactly what FRED's `latestTwo()` returns. Claims
 * revise almost every week and payrolls by ±50-100K, and both still match.
 *
 * (Seasonal adjustment is why CPI's two identically-named rows are *guaranteed*
 * distinct — BLS publishes m/m adjusted and y/y unadjusted — but that is a BLS
 * price-release convention, not the mechanism, and it does not extend to BEA or
 * Census. Hence unique-match rather than trusting it.)
 */
export function matchRow(
  rows: CalendarRow[],
  eventName: string,
  fredPrior: number,
  dp: number,
): CalendarRow | null {
  const round = (n: number) => Math.round(n * 10 ** dp) / 10 ** dp;
  const target = round(fredPrior);
  const named = rows.filter((r) => r.eventName.toLowerCase() === eventName.toLowerCase());
  const hits = named.filter((r) => r.previous != null && round(r.previous) === target);

  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    logger.warn(SRC, "Ambiguous consensus rows — omitting rather than guessing", {
      eventName,
      fredPrior: target,
      candidates: hits.length,
    });
  }
  return null;
}

/**
 * Health for the run.
 *
 * `itemsExpected` / `itemsGot` are the join-health signal, and they matter more
 * than the HTTP status: Nasdaq answering 200 while zero specs matched is total
 * content loss that a liveness check reads as perfectly fine.
 *
 * `expectedToday` doubles as the runtime assertion on the bucket offset. On a day
 * FRED says a tracked release printed, a bucket holding no name-match at all means
 * the offset convention moved, and that is a different problem from a bad join.
 */
export function consensusHealth(
  fetched: ConsensusFetch,
  expectedToday: number,
  matched: number,
): ConnectorHealth {
  if (fetched.rows == null) {
    return { name: "Nasdaq consensus", status: "down", detail: `no answer for bucket ${fetched.bucket}` };
  }
  if (expectedToday === 0) {
    return { name: "Nasdaq consensus", status: "empty", detail: "no tracked release printed today" };
  }
  if (matched === 0) {
    return {
      name: "Nasdaq consensus",
      status: "degraded",
      detail: `answered but matched none of ${expectedToday} scheduled releases — the bucket offset or the event names may have changed`,
      itemsExpected: expectedToday,
      itemsGot: 0,
    };
  }
  return {
    name: "Nasdaq consensus",
    status: matched < expectedToday ? "degraded" : "ok",
    detail: matched < expectedToday ? "some releases had no matching row" : undefined,
    itemsExpected: expectedToday,
    itemsGot: matched,
  };
}
