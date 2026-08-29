import { describe, it, expect } from "vitest";
import { evaluateSession } from "@/lib/notes/session";

/** 16:00 ET (a US cash close) on `date`, in epoch ms. August = EDT (UTC-4). */
const close = (date: string) => Date.parse(`${date}T20:00:00Z`);
const at = (iso: string) => Date.parse(iso);

describe("evaluateSession — delay tolerance (the 2026-08 GitHub-cron bug)", () => {
  it("publishes the closed session when the FIRST cron slips ~5h but stays in-day ET", () => {
    // Aug 26 note, cron 22:20 UTC ran 03:21 UTC Aug 27 = 23:21 EDT Aug 26.
    const r = evaluateSession(at("2026-08-27T03:21:00Z"), close("2026-08-26"), "CLOSED");
    expect(r.isSession).toBe(true);
    expect(r.marketDate).toBe("2026-08-26");
  });

  it("STILL publishes the same session when the second cron slips PAST ET midnight", () => {
    // The old gate skipped here ("not today-ET"): 04:31 UTC = 00:31 EDT Aug 27,
    // but the S&P's last print is still Aug 26. New gate publishes Aug 26 again
    // (an idempotent re-edit), no false skip.
    const r = evaluateSession(at("2026-08-27T04:31:00Z"), close("2026-08-26"), "CLOSED");
    expect(r.isSession).toBe(true);
    expect(r.marketDate).toBe("2026-08-26");
  });

  it("recovers a session whose BOTH crons landed after ET midnight (the lost Thu Aug 27)", () => {
    // Both runs at 06:10 / 06:56 UTC Aug 28 = 02:10 / 02:56 EDT — pre-market, the
    // Thursday close still the last print. Old gate skipped both → no note.
    const r = evaluateSession(at("2026-08-28T06:10:00Z"), close("2026-08-27"), "CLOSED");
    expect(r.isSession).toBe(true);
    expect(r.marketDate).toBe("2026-08-27");
  });

  it("accepts a PRE (next-morning) state for the prior completed session", () => {
    const r = evaluateSession(at("2026-08-28T12:00:00Z"), close("2026-08-27"), "PRE");
    expect(r.isSession).toBe(true);
    expect(r.marketDate).toBe("2026-08-27");
  });

  it("is unchanged on a punctual run", () => {
    // Cron 22:20 UTC = 18:20 EDT Aug 28.
    const r = evaluateSession(at("2026-08-28T22:20:00Z"), close("2026-08-28"), "CLOSED");
    expect(r.isSession).toBe(true);
    expect(r.marketDate).toBe("2026-08-28");
  });

  it("rejects a LIVE session — a mid-session run must never snapshot live prices", () => {
    // 14:00 UTC = 10:00 EDT, market open.
    const r = evaluateSession(at("2026-08-28T14:00:00Z"), at("2026-08-28T14:00:00Z"), "REGULAR");
    expect(r.isSession).toBe(false);
    expect(r.reason).toMatch(/REGULAR/);
  });

  it("rejects a stale/frozen feed (last print older than a long holiday weekend)", () => {
    const r = evaluateSession(at("2026-08-29T12:00:00Z"), close("2026-08-20"), "CLOSED");
    expect(r.isSession).toBe(false);
    expect(r.reason).toMatch(/stale/);
  });

  it("rejects a quote with no marketState", () => {
    const r = evaluateSession(at("2026-08-28T22:20:00Z"), close("2026-08-28"), null);
    expect(r.isSession).toBe(false);
  });

  it("rejects an empty/garbage marketState even when the print is fresh", () => {
    const r = evaluateSession(at("2026-08-28T22:20:00Z"), close("2026-08-28"), "");
    expect(r.isSession).toBe(false);
    expect(r.reason).toMatch(/marketState/);
  });

  it("accepts a print up to the 6-day freshness bound and rejects beyond it", () => {
    // 6 days: Thu close read the next Wed (Fri + Mon both holidays). Still valid.
    expect(evaluateSession(at("2026-08-26T12:00:00Z"), close("2026-08-20"), "CLOSED").isSession).toBe(true);
    // 7 days: frozen feed.
    expect(evaluateSession(at("2026-08-27T12:00:00Z"), close("2026-08-20"), "CLOSED").isSession).toBe(false);
  });

  it("accepts a Friday close read the following Wednesday after a Monday holiday", () => {
    // Fri Aug 28 close, read Wed Sep 2 (Mon Aug 31 holiday, Tue Sep 1 ... say the
    // feed is only 5 days stale): still within the freshness bound.
    const r = evaluateSession(at("2026-09-02T12:00:00Z"), close("2026-08-28"), "CLOSED");
    expect(r.isSession).toBe(true);
    expect(r.marketDate).toBe("2026-08-28");
  });
});
