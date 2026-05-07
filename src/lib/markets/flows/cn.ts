/**
 * CN northbound (Stock Connect) flow fetcher.
 *
 * ── Data-availability reality (read this first) ────────────────────────
 * The CSRC / HKEX stopped publishing daily *net* northbound buy/sell
 * figures in August 2024. Every JSON endpoint returns `null` for
 * `FUND_INFLOW`, `NET_DEAL_AMT`, `BUY_AMT`, `SELL_AMT` for every northbound
 * trading day after that date. Probed sources confirmed (May 2026):
 *   - hkex.com.hk daily-stat pages — 404 / not exposed as JSON
 *   - eastmoney push2 kamt.kline   — every recent day's `dayNetAmtIn` is 0
 *   - eastmoney datacenter v1      — null for all flow columns post-Aug-24
 * Daily *turnover* (DEAL_AMT) and transaction count (DEAL_NUM) are the
 * only northbound metrics that are still updated daily. We use the sum of
 * the Shanghai (MUTUAL_TYPE=001) and Shenzhen (MUTUAL_TYPE=003)
 * northbound DEAL_AMT as the headline "activity" number, and an
 * elevated/normal/subdued classification vs the trailing 20-day mean.
 *
 * If a future regulatory change re-publishes net flow, swap the
 * `DEAL_AMT` column for `NET_DEAL_AMT` and update the metric label.
 *
 * ── Pattern (mirror this for JP / HK / SGX flow fetchers) ──────────────
 *   - Module under src/lib/markets/flows/{market}.ts
 *   - Exports a single `fetch{Market}Flow()` returning `<Market>FlowData | null`
 *   - Cache key:  markets:flows:{market}:northbound (or appropriate suffix)
 *   - TTL:        1h  (cnflow refreshes daily; 1h tolerates retry storms
 *                 without hammering eastmoney)
 *   - Stale:      12 × TTL accepted on hard failure
 *   - Hard fail:  return null  → modal renders "data unavailable"
 */

import { getCache, setCache } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";

const CACHE_KEY = "markets:flows:cn:northbound";
const CACHE_TTL_SECONDS = 60 * 60; // 1h
const STALE_MULTIPLIER = 12; // 12h fallback on hard error

const SOURCE_NAME = "Eastmoney HSGT (Stock Connect)";

// MUTUAL_TYPE values:
//   001 = HK→Shanghai (northbound to SH)
//   003 = HK→Shenzhen (northbound to SZ)
//   002, 004 = southbound (handled by the HK fetcher)
const NORTHBOUND_TYPES = ["001", "003"] as const;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Public types ──────────────────────────────────────────────────────

export type CNFlowMetric = "turnover_proxy" | "net_flow";

export interface CNNorthboundFlowData {
  /** Which underlying metric the numbers represent. After Aug 2024
   *  net flow is no longer published, so we use turnover as a proxy. */
  metric: CNFlowMetric;
  /** Today's combined SH+SZ northbound figure, in RMB (元, raw — not 万). */
  value: number;
  /** Trailing 20-trading-day average of the same metric. */
  value20dAvg: number;
  /** Activity classification today vs 20d average. */
  activity: "elevated" | "normal" | "subdued";
  /** Up to 20 most recent daily values, oldest first. */
  recent: Array<{ date: string; value: number }>;
  /** ISO date of the latest data point. */
  dataDate: string;
  /** Source identifier. */
  source: string;
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
  /** Free-text caveat — surface in the modal so users know what they see. */
  note: string;
}

// ── Internal types (eastmoney response shape) ─────────────────────────

interface EastmoneyRow {
  MUTUAL_TYPE: string; // "001" | "003" | …
  TRADE_DATE: string;  // "2026-05-06 00:00:00"
  DEAL_AMT: number | null;        // turnover in 万 RMB (10000 RMB)
  NET_DEAL_AMT: number | null;    // null after Aug 2024
  BUY_AMT: number | null;
  SELL_AMT: number | null;
  FUND_INFLOW: number | null;
}

interface EastmoneyResponse {
  success: boolean;
  result: { data: EastmoneyRow[] } | null;
}

// ── Fetch one direction's history ─────────────────────────────────────

async function fetchHistoryFor(mutualType: string, days: number): Promise<EastmoneyRow[]> {
  const params = new URLSearchParams({
    reportName: "RPT_MUTUAL_DEAL_HISTORY",
    columns: "MUTUAL_TYPE,TRADE_DATE,DEAL_AMT,NET_DEAL_AMT,BUY_AMT,SELL_AMT,FUND_INFLOW",
    source: "WEB",
    pageNumber: "1",
    pageSize: String(days),
    sortColumns: "TRADE_DATE",
    sortTypes: "-1",
    filter: `(MUTUAL_TYPE="${mutualType}")`,
  });
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?${params.toString()}`;

  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json,text/plain,*/*",
      Referer: "https://data.eastmoney.com/",
    },
    // Eastmoney is fast; set a tight enough timeout via AbortSignal.
    signal: AbortSignal.timeout(10_000),
  });

  if (!r.ok) {
    throw new Error(`Eastmoney HTTP ${r.status} for MUTUAL_TYPE=${mutualType}`);
  }

  const text = await r.text();
  let json: EastmoneyResponse;
  try {
    json = JSON.parse(text) as EastmoneyResponse;
  } catch {
    throw new Error(`Eastmoney non-JSON response (${text.slice(0, 120)})`);
  }

  if (!json.success || !json.result?.data) {
    throw new Error("Eastmoney response missing result.data");
  }
  return json.result.data;
}

// ── Aggregate the two northbound directions into a daily series ───────

interface DailyAgg {
  date: string;          // ISO yyyy-mm-dd
  dealAmtWan: number;    // sum across SH+SZ in 万 RMB
  hasNetFlow: boolean;   // true only when both legs report NET_DEAL_AMT
  netDealAmtWan: number; // sum of NET_DEAL_AMT (RMB 万) when available
}

function aggregateDaily(rows: EastmoneyRow[]): DailyAgg[] {
  const byDate = new Map<string, { dealAmt: number; netSum: number; netCount: number; legs: number }>();

  for (const row of rows) {
    const date = row.TRADE_DATE.slice(0, 10);
    const slot = byDate.get(date) ?? { dealAmt: 0, netSum: 0, netCount: 0, legs: 0 };
    slot.legs += 1;
    if (typeof row.DEAL_AMT === "number") slot.dealAmt += row.DEAL_AMT;
    if (typeof row.NET_DEAL_AMT === "number") {
      slot.netSum += row.NET_DEAL_AMT;
      slot.netCount += 1;
    }
    byDate.set(date, slot);
  }

  // Only keep dates where both legs reported (data integrity).
  const out: DailyAgg[] = [];
  byDate.forEach((slot, date) => {
    if (slot.legs < 2) return;
    out.push({
      date,
      dealAmtWan: slot.dealAmt,
      hasNetFlow: slot.netCount === 2,
      netDealAmtWan: slot.netSum,
    });
  });
  // Oldest first
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ── Public fetcher ────────────────────────────────────────────────────

export async function fetchCNNorthboundFlow(): Promise<CNNorthboundFlowData | null> {
  // Fast path: serve fresh-cached data
  const cached = await getCache<CNNorthboundFlowData>(CACHE_KEY, CACHE_TTL_SECONDS);
  if (cached && !cached.isStale) return cached.data;

  try {
    // Fetch both directions in parallel — 25 days is enough for a 20d
    // average plus a few extra in case of holidays.
    const [shRows, szRows] = await Promise.all(
      NORTHBOUND_TYPES.map((t) => fetchHistoryFor(t, 25)),
    );

    const daily = aggregateDaily([...shRows, ...szRows]);
    if (daily.length === 0) {
      logger.warn("markets/flows/cn", "No daily rows aggregated");
      // Fall through to stale fallback below
      throw new Error("Empty aggregate");
    }

    const latest = daily[daily.length - 1]!;

    // 万 (10,000) → RMB. Net flow may exist for old data only.
    const useNetFlow = latest.hasNetFlow;
    const valueWan = useNetFlow ? latest.netDealAmtWan : latest.dealAmtWan;

    // 20d trailing average (excluding today). Use turnover as the
    // comparison metric since net flow is unavailable for the modern
    // window — this keeps the 20d series consistent.
    const window = daily.slice(-21, -1);
    const avgWan =
      window.length > 0
        ? window.reduce((s, d) => s + d.dealAmtWan, 0) / window.length
        : latest.dealAmtWan;

    const todayWan = latest.dealAmtWan;
    const activity: CNNorthboundFlowData["activity"] =
      todayWan > avgWan * 1.15
        ? "elevated"
        : todayWan < avgWan * 0.85
          ? "subdued"
          : "normal";

    const recent = daily.slice(-20).map((d) => ({
      date: d.date,
      value: (useNetFlow && d.hasNetFlow ? d.netDealAmtWan : d.dealAmtWan) * 10_000,
    }));

    const data: CNNorthboundFlowData = {
      metric: useNetFlow ? "net_flow" : "turnover_proxy",
      value: valueWan * 10_000,
      value20dAvg: avgWan * 10_000,
      activity,
      recent,
      dataDate: latest.date,
      source: SOURCE_NAME,
      fetchedAt: new Date().toISOString(),
      note: useNetFlow
        ? "Daily net northbound flow (RMB)."
        : "Net northbound buy/sell figures stopped being published in Aug 2024. Showing daily turnover (RMB) as activity proxy.",
    };

    await setCache(CACHE_KEY, data);
    return data;
  } catch (e) {
    logger.error("markets/flows/cn", "Failed to fetch CN northbound flow", { error: e });
    // Stale fallback (12h)
    const stale = await getCache<CNNorthboundFlowData>(
      CACHE_KEY,
      CACHE_TTL_SECONDS * STALE_MULTIPLIER,
    );
    if (stale) return stale.data;
    return null;
  }
}
