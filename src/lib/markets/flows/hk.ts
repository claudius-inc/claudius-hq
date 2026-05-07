/**
 * HK southbound (Stock Connect) flow fetcher.
 *
 * ── Why southbound for Hong Kong ───────────────────────────────────────
 * Mainland investors trading HK-listed shares via the Shanghai- and
 * Shenzhen-Hong Kong Stock Connect ("southbound") have become the
 * dominant marginal flow into HK equities. Unlike the northbound
 * (HK→CN) leg whose net buy/sell figures stopped being published in
 * Aug 2024, the southbound (CN→HK) leg still publishes real
 * `NET_DEAL_AMT`, `BUY_AMT`, and `SELL_AMT` daily — verified May 2026
 * via probe-hk-southbound.ts. Sample (2026-05-06):
 *   - SH→HK (002):  NET_DEAL_AMT = −1360.93 万 HKD
 *   - SZ→HK (004):  NET_DEAL_AMT = −7203.70 万 HKD
 * The values are in 10,000-HKD (万) units. We aggregate the two legs
 * into a single daily net-flow series in raw HKD.
 *
 * Direction semantics:
 *   - "supportive"  net buying ≥ 1.15 × |20d-avg| AND positive
 *   - "headwind"    net selling, magnitude ≥ 1.15 × |20d-avg|
 *   - "neutral"     small flow within ±15% of the 20-day average
 *
 * ── Pattern (mirror of src/lib/markets/flows/cn.ts) ────────────────────
 *   - Module under src/lib/markets/flows/{market}.ts
 *   - Exports a single fetchHKSouthboundFlow() returning HKFlowData | null
 *   - Cache key:  markets:flows:hk:southbound
 *   - TTL:        1h  (southbound updates daily; 1h matches the CN
 *                 fetcher and tolerates retry storms gracefully)
 *   - Stale:      12 × TTL accepted on hard failure
 *   - Hard fail:  return null  → modal renders "data unavailable"
 */

import { getCache, setCache } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";

const CACHE_KEY = "markets:flows:hk:southbound";
const CACHE_TTL_SECONDS = 60 * 60; // 1h
const STALE_MULTIPLIER = 12; // 12h fallback on hard error

const SOURCE_NAME = "Eastmoney HSGT (Stock Connect)";

// MUTUAL_TYPE values:
//   001 = HK→Shanghai (northbound to SH) — handled by cn.ts
//   003 = HK→Shenzhen (northbound to SZ) — handled by cn.ts
//   002 = Shanghai→HK (southbound from SH)
//   004 = Shenzhen→HK (southbound from SZ)
const SOUTHBOUND_TYPES = ["002", "004"] as const;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Public types ──────────────────────────────────────────────────────

export interface HKFlowData {
  /** Discriminator — matches the modal payload contract. */
  metric: "southbound_net";

  /** Headline numeric value in raw HKD. Positive = net inflow (buying). */
  primaryValue: number;
  /** Human-readable label for the headline figure. */
  primaryLabel: string;
  /** Color/direction classification for the modal badge. */
  direction: "supportive" | "neutral" | "headwind";

  /** 20-trading-day average of the same metric (HKD). */
  contextValue: number;
  /** Human-readable label for the comparator. */
  contextLabel: string;

  /** Last 20 daily values (HKD), oldest first — for the sparkline. */
  recent: Array<{ date: string; value: number }>;

  /** Plain-English one-liner. */
  interpretation: string;

  /** ISO date of the latest data point. */
  dataDate: string;
  /** Source identifier. */
  source: string;
  /** ISO timestamp of the fetch. */
  fetchedAt: string;
  /** Optional caveat (e.g. "data freeze fallback"). */
  note?: string;
}

// ── Internal types (eastmoney response shape) ─────────────────────────

interface EastmoneyRow {
  MUTUAL_TYPE: string; // "002" | "004"
  TRADE_DATE: string;  // "2026-05-06 00:00:00"
  DEAL_AMT: number | null;        // turnover in 万 HKD
  NET_DEAL_AMT: number | null;    // net flow in 万 HKD
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
    // Eastmoney is fast; tight timeout via AbortSignal.
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

// ── Aggregate the two southbound directions into a daily series ───────

interface DailyAgg {
  date: string;          // ISO yyyy-mm-dd
  netDealAmtWan: number; // sum across SH+SZ in 万 HKD
  legs: number;          // 1 or 2 — only keep complete days
}

function aggregateDaily(rows: EastmoneyRow[]): DailyAgg[] {
  const byDate = new Map<string, { netSum: number; legs: number; netCount: number }>();

  for (const row of rows) {
    if (typeof row.NET_DEAL_AMT !== "number") continue;
    const date = row.TRADE_DATE.slice(0, 10);
    const slot = byDate.get(date) ?? { netSum: 0, legs: 0, netCount: 0 };
    slot.legs += 1;
    slot.netSum += row.NET_DEAL_AMT;
    slot.netCount += 1;
    byDate.set(date, slot);
  }

  // Only keep dates where both legs reported (data integrity).
  const out: DailyAgg[] = [];
  byDate.forEach((slot, date) => {
    if (slot.legs < 2) return;
    out.push({ date, netDealAmtWan: slot.netSum, legs: slot.legs });
  });
  // Oldest first
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ── Public fetcher ────────────────────────────────────────────────────

export async function fetchHKSouthboundFlow(): Promise<HKFlowData | null> {
  // Fast path: serve fresh-cached data
  const cached = await getCache<HKFlowData>(CACHE_KEY, CACHE_TTL_SECONDS);
  if (cached && !cached.isStale) return cached.data;

  try {
    // Fetch both directions in parallel — 25 days covers a 20-day mean
    // plus holiday buffer.
    const [shRows, szRows] = await Promise.all(
      SOUTHBOUND_TYPES.map((t) => fetchHistoryFor(t, 25)),
    );

    const daily = aggregateDaily([...shRows, ...szRows]);
    if (daily.length === 0) {
      logger.warn("markets/flows/hk", "No daily rows aggregated");
      throw new Error("Empty aggregate");
    }

    const latest = daily[daily.length - 1]!;

    // 万 (10,000) → raw HKD
    const todayHkd = latest.netDealAmtWan * 10_000;

    // 20d trailing average (excluding today). Using net flow because
    // southbound is still published — the consistency caveat from CN
    // does not apply here.
    const window = daily.slice(-21, -1);
    const avgWan =
      window.length > 0
        ? window.reduce((s, d) => s + d.netDealAmtWan, 0) / window.length
        : latest.netDealAmtWan;
    const avgHkd = avgWan * 10_000;

    // Direction:
    //   supportive  → today ≥ avg + 0.15·|avg|  AND  today > 0
    //   headwind    → today ≤ avg − 0.15·|avg|  OR  today < −0.15·|avg|
    //   neutral     → otherwise
    // We compare deviation to magnitude of the average; when the average
    // is small (≈0) we fall back to comparing to today's absolute value.
    const refMag = Math.max(Math.abs(avgHkd), Math.abs(todayHkd) * 0.5, 1);
    const deviation = todayHkd - avgHkd;
    let direction: HKFlowData["direction"];
    if (deviation > 0.15 * refMag && todayHkd > 0) {
      direction = "supportive";
    } else if (deviation < -0.15 * refMag || todayHkd < -0.15 * refMag) {
      direction = "headwind";
    } else {
      direction = "neutral";
    }

    const recent = daily.slice(-20).map((d) => ({
      date: d.date,
      value: d.netDealAmtWan * 10_000,
    }));

    const interpretation =
      direction === "supportive"
        ? "Mainland investors net buying HK shares — supportive of the Hang Seng."
        : direction === "headwind"
          ? "Mainland investors net selling HK shares — flow headwind."
          : "Southbound flow in line with the 20-day average — no directional pressure.";

    const data: HKFlowData = {
      metric: "southbound_net",
      primaryValue: todayHkd,
      primaryLabel: "Southbound net flow (HKD)",
      direction,
      contextValue: avgHkd,
      contextLabel: "20d avg",
      recent,
      interpretation,
      dataDate: latest.date,
      source: SOURCE_NAME,
      fetchedAt: new Date().toISOString(),
      note: "Daily net southbound (CN→HK) buy/sell flow in HKD. Aggregates the SH (002) and SZ (004) Stock Connect legs.",
    };

    await setCache(CACHE_KEY, data);
    return data;
  } catch (e) {
    logger.error("markets/flows/hk", "Failed to fetch HK southbound flow", { error: e });
    // Stale fallback (12h)
    const stale = await getCache<HKFlowData>(
      CACHE_KEY,
      CACHE_TTL_SECONDS * STALE_MULTIPLIER,
    );
    if (stale) return stale.data;
    return null;
  }
}
