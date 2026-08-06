import { describe, it, expect, vi } from "vitest";

// The module imports `@/db`, which builds a libsql client from env vars at
// import time. Stub it — these tests exercise query construction, not I/O.
vi.mock("@/db", () => ({
  db: {},
  rawClient: {},
  momentumSnapshots: { snapshotDate: "snapshot_date" },
}));

// Static import is safe despite the mock above: vi.mock calls are hoisted.
import { buildSelectionQuery, MOMENTUM_REPORT_CONFIG } from "@/lib/markets/momentum-report";

const countPlaceholders = (s: string) => (s.match(/\?/g) ?? []).length;

describe("buildSelectionQuery", () => {
  const q = buildSelectionQuery("2026-08-05", "2026-08-06");

  it("binds exactly as many args as there are placeholders", () => {
    // The three clause builders are concatenated, so a `?` added to one without
    // a matching arg shifts every later binding — producing wrong picks
    // silently rather than an error.
    expect(countPlaceholders(q.from) + countPlaceholders(q.where)).toBe(q.args.length);
  });

  it("orders args to match placeholder position in SQL text", () => {
    expect(q.args).toEqual([
      "2026-08-05", // ms.snapshot_date join
      "2026-08-06", // hist window upper bound
      "2026-08-06", // hist window lower bound
      "2026-08-06", // cooldown lower bound
      "2026-08-06", // cooldown upper bound
    ]);
  });

  it("excludes weekend snapshots from the history window", () => {
    // Sat/Sun/Mon snapshots are byte-identical copies of Friday's last scan,
    // so counting them let `strong_days >= 3` be satisfied by one trading day.
    expect(q.from).toMatch(/strftime\('%w', snapshot_date\)/);
    expect(q.from).toMatch(/BETWEEN 1 AND 5/);
  });

  it("gates on last_good_scan_at rather than computed_at", () => {
    // computed_at is bumped even by the preserve-on-failure path, so it cannot
    // detect a row frozen by a permanently failing ticker.
    expect(q.where).toMatch(/last_good_scan_at/);
    expect(q.where).not.toMatch(/tm\.computed_at\s*>=/);
  });

  it("restricts the cooldown to picks that were actually reported", () => {
    expect(q.where).toMatch(/p\.reported = 1/);
  });

  it("excludes today from the cooldown so a same-day re-run is idempotent", () => {
    expect(q.where).toMatch(/p\.report_date < \?/);
  });

  it("does NOT filter on the momentum band (applied after the query)", () => {
    // The band must not be in SQL: out-of-band candidates are the control group
    // that makes the band re-derivable out-of-sample.
    expect(q.where).not.toMatch(/momentum_score BETWEEN/);
  });

  it("keeps the data-sanity bounds that caught the MVIS split artifact", () => {
    expect(q.where).toMatch(/price_change_1d BETWEEN -30 AND 30/);
  });

  it("scales GBp floors per field: pence for price/turnover, pounds for mcap", () => {
    // The GBp trap: Yahoo quotes LSE `price` in PENCE but reports `market_cap`
    // in POUNDS (verified live — ANTO.L price 3990, market_cap 3.92e10 ~ £39B).
    // So the price and turnover floors are 100x their GBP equivalents while the
    // market-cap floor must be 1x. Getting mcap wrong excluded every LSE
    // listing below ~£24B.
    //
    // The three CASE blocks appear in WHERE order: price, mcap, turnover.
    const re = /WHEN 'GBP' THEN (\S+)\s+WHEN 'GBp' THEN (\S+)/g;
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(q.where)) !== null) matches.push(m);
    expect(matches).toHaveLength(3);

    const ratio = (x: RegExpExecArray) => Number(x[2]) / Number(x[1]);
    expect(ratio(matches[0])).toBe(100); // price: pence
    expect(ratio(matches[1])).toBe(1); // market cap: pounds
    expect(ratio(matches[2])).toBe(100); // turnover: pence
  });

  it("treats a null avg_dollar_vol_20d as passing during column rollout", () => {
    expect(q.where).toMatch(/avg_dollar_vol_20d IS NULL OR/);
  });
});

describe("MOMENTUM_REPORT_CONFIG", () => {
  it("keeps the momentum band inside 0-100 and correctly ordered", () => {
    expect(MOMENTUM_REPORT_CONFIG.momMin).toBeLessThan(MOMENTUM_REPORT_CONFIG.momMax);
    expect(MOMENTUM_REPORT_CONFIG.momMin).toBeGreaterThanOrEqual(0);
    expect(MOMENTUM_REPORT_CONFIG.momMax).toBeLessThanOrEqual(100);
  });

  it("cannot require more strong days than the history window provides", () => {
    expect(MOMENTUM_REPORT_CONFIG.strongDays).toBeLessThanOrEqual(MOMENTUM_REPORT_CONFIG.histDays);
  });
});
