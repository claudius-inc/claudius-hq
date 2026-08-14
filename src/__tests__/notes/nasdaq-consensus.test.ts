/**
 * The consensus join.
 *
 * Two rows on the calendar are both called "CPI" at the same minute — one m/m,
 * one y/y — and the payload has seven keys, none of which separates them. So the
 * join is on the PRIOR VALUE, and the rule is unique match: exactly one row, or
 * no consensus. First-match-wins would silently attach a monthly consensus to an
 * annual print, which is a wrong number that looks completely right.
 *
 * The fixtures are transcribed from live payloads on 2026-08-13/14, not invented,
 * because the failure this guards is a mismatch with reality rather than with a
 * specification.
 */
import { describe, it, expect } from "vitest";
import { matchRow, parseFigure, bucketFor, consensusHealth, type CalendarRow } from "@/lib/notes/sources/nasdaq-consensus";

const row = (eventName: string, actual: number | null, consensus: number | null, previous: number | null): CalendarRow => ({
  eventName,
  timeEt: "08:30",
  actual,
  consensus,
  previous,
});

/** Verbatim from the 2026-08-13 bucket (true ET date 2026-08-12). */
const CPI_DAY: CalendarRow[] = [
  row("CPI", 0.1, 0.1, -0.4), // m/m, from the seasonally adjusted series
  row("CPI", 3.4, 3.4, 3.5), // y/y, from the unadjusted series
  row("Core CPI", 0.2, 0.2, 0.3),
  row("Core CPI", 2.5, 2.5, 2.6),
];

/** Verbatim from the 2026-08-15 bucket — the retail-sales collision case. */
const RETAIL_DAY: CalendarRow[] = [
  row("Core Retail Sales", null, 0.2, -0.2),
  row("Retail Control", null, null, 0.5),
  row("Retail Sales", null, 0.1, 0.2), // m/m
  row("Retail Sales", null, null, 6.72), // y/y
  row("Retail Sales Ex Gas/Autos", null, null, 0.4),
];

describe("parseFigure", () => {
  it("reads the display strings the calendar actually sends", () => {
    expect(parseFigure("0.1%")).toBe(0.1);
    expect(parseFigure("-0.4%")).toBe(-0.4);
    expect(parseFigure("1,777K")).toBe(1777);
    expect(parseFigure("14.17B")).toBe(14.17);
  });

  it("does NOT expand the k suffix", () => {
    // FRED's own `scale` already puts claims and payrolls in thousands, so "209K"
    // and FRED's 209 are the same number in the same units. Expanding here would
    // break the very join this exists to serve.
    expect(parseFigure("209K")).toBe(209);
  });

  it("treats the blank forms as absent", () => {
    expect(parseFigure("&nbsp;")).toBeNull();
    expect(parseFigure("")).toBeNull();
    expect(parseFigure(undefined)).toBeNull();
  });
});

describe("bucketFor", () => {
  it("adds the measured one-day offset", () => {
    // Retail sales printed Friday 2026-08-14 and sits in the SATURDAY bucket,
    // which is proof the field is not a release date.
    expect(bucketFor("2026-08-14")).toBe("2026-08-15");
    expect(bucketFor("2026-08-12")).toBe("2026-08-13");
  });
});

describe("matchRow — unique match on the prior", () => {
  it("picks the y/y row for a y/y spec", () => {
    // CPIAUCNS pc1 prior is 3.5. Only one row carries it.
    const hit = matchRow(CPI_DAY, "CPI", 3.5, 1);
    expect(hit?.actual).toBe(3.4);
    expect(hit?.consensus).toBe(3.4);
  });

  it("picks the m/m row for an m/m prior, from the same two identically-named rows", () => {
    const hit = matchRow(CPI_DAY, "CPI", -0.4, 1);
    expect(hit?.actual).toBe(0.1);
  });

  it("does not confuse a sibling release with a similar name", () => {
    // "Core CPI" must never satisfy a "CPI" lookup, even though its prior is close.
    expect(matchRow(CPI_DAY, "CPI", 2.6, 1)).toBeNull();
  });

  it("resolves the retail-sales family without touching the core row", () => {
    // RSAFS pch prior is 0.2. "Core Retail Sales" is named distinctly, and the
    // second "Retail Sales" is the y/y at 6.72.
    const hit = matchRow(RETAIL_DAY, "Retail Sales", 0.2, 1);
    expect(hit?.consensus).toBe(0.1);
  });

  it("returns nothing when two same-named rows share the prior", () => {
    // The collision the unique-match rule exists for. Degrade to prior-only
    // rather than attach one of two indistinguishable numbers.
    const ambiguous = [row("CPI", 0.1, 0.1, 0.3), row("CPI", 3.4, 3.4, 0.3)];
    expect(matchRow(ambiguous, "CPI", 0.3, 1)).toBeNull();
  });

  it("compares at the spec's own precision, not by float equality", () => {
    // FRED returns 3.4999 for a figure the calendar shows as 3.5.
    expect(matchRow(CPI_DAY, "CPI", 3.4999, 1)?.actual).toBe(3.4);
  });

  it("matches a zero-dp count series", () => {
    // Claims: Nasdaq "200K" parses to 200; FRED's 200,000 with scale 1e-3 is 200.
    const claims = [row("Initial Jobless Claims", 209, 202, 200)];
    expect(matchRow(claims, "Initial Jobless Claims", 200, 0)?.consensus).toBe(202);
  });

  it("matches a negative payrolls print", () => {
    const jobs = [row("Nonfarm Payrolls", -23, 85, 20)];
    expect(matchRow(jobs, "Nonfarm Payrolls", 20, 0)?.consensus).toBe(85);
  });
});

describe("consensusHealth", () => {
  it("is down when the endpoint never answered", () => {
    expect(consensusHealth({ rows: null, bucket: "2026-08-15" }, 2, 0).status).toBe("down");
  });

  it("is empty when nothing was scheduled, which is not a failure", () => {
    expect(consensusHealth({ rows: [], bucket: "2026-08-15" }, 0, 0).status).toBe("empty");
  });

  it("is degraded when it answered but matched nothing", () => {
    // 200 OK with zero matches is total content loss that a liveness check reads
    // as perfectly healthy — the offset or the event names may have moved.
    const health = consensusHealth({ rows: CPI_DAY, bucket: "2026-08-13" }, 2, 0);
    expect(health.status).toBe("degraded");
    expect(health.itemsGot).toBe(0);
    expect(health.detail).toMatch(/offset or the event names/);
  });

  it("is degraded on partial coverage and ok on full", () => {
    expect(consensusHealth({ rows: CPI_DAY, bucket: "x" }, 2, 1).status).toBe("degraded");
    expect(consensusHealth({ rows: CPI_DAY, bucket: "x" }, 2, 2).status).toBe("ok");
  });
});
