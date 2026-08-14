/**
 * The alert escalation rules.
 *
 * These are the whole behaviour of Part E, and every one of them exists because
 * the obvious design was wrong. Edge-triggering alone flaps: a connector that
 * alternates down/ok/down produces an edge every night, which is noisier than the
 * nightly digest it replaced — and that is not hypothetical, it is the measured
 * shape of Yahoo blanking open interest overnight.
 *
 * Testing them here rather than in production is the point: a rule that
 * over-alerts trains the operator to ignore the digest, and a rule that
 * under-alerts is invisible by construction.
 */
import { describe, it, expect } from "vitest";
import {
  decideAlerts,
  missingFromRegistry,
  formatDigest,
  CONNECTOR_REGISTRY,
  type ConnectorHealth,
  type StoredHealth,
} from "@/lib/notes/health";

const h = (name: string, status: ConnectorHealth["status"], detail?: string): ConnectorHealth => ({
  name,
  status,
  detail,
});

const stored = (over: Partial<StoredHealth> & { name: string }): StoredHealth => ({
  lastStatus: "ok",
  streakCount: 0,
  lastRunDate: "2026-08-13",
  lastAlertedDate: null,
  ...over,
});

describe("decideAlerts — what earns a message", () => {
  it("alerts on the first session a connector is down", () => {
    // A first 403 from an IP block should land the same evening.
    const d = decideAlerts([h("Nasdaq consensus", "down", "HTTP 403")], [], "2026-08-14");
    expect(d.alerts.map((a) => a.name)).toEqual(["Nasdaq consensus"]);
    expect(d.updates[0].streakCount).toBe(1);
    expect(d.updates[0].lastAlertedDate).toBe("2026-08-14");
  });

  it("waits for a SECOND session before alerting on degraded", () => {
    // A degradation that heals overnight is the one event the operator cannot
    // act on — it is over before they read the message.
    const first = decideAlerts([h("SPY option chain", "degraded", "4 of 13 expirations empty")], [], "2026-08-14");
    expect(first.alerts).toHaveLength(0);
    expect(first.updates[0].streakCount).toBe(1);

    const second = decideAlerts(
      [h("SPY option chain", "degraded", "4 of 13 expirations empty")],
      [stored({ name: "SPY option chain", lastStatus: "degraded", streakCount: 1 })],
      "2026-08-17",
    );
    expect(second.alerts).toHaveLength(1);
    expect(second.updates[0].streakCount).toBe(2);
  });

  it("does not flap on a connector that alternates", () => {
    // down, ok, down, ok would be an edge every night under naive edge-triggering.
    // The degraded case is silent on a single night; recovery is only reported for
    // a failure that was actually alerted.
    const bad = decideAlerts([h("SPY option chain", "degraded")], [], "2026-08-14");
    expect(bad.shouldSend).toBe(false);

    const good = decideAlerts([h("SPY option chain", "ok")], bad.updates, "2026-08-17");
    expect(good.recovered).toEqual([]);
    expect(good.shouldSend).toBe(false);
  });

  it("reports recovery only for a failure the operator was told about", () => {
    const down = decideAlerts([h("Treasury yields", "down")], [], "2026-08-14");
    expect(down.alerts).toHaveLength(1);

    const back = decideAlerts([h("Treasury yields", "ok")], down.updates, "2026-08-17");
    expect(back.recovered).toEqual(["Treasury yields"]);
    expect(back.shouldSend).toBe(true);
    expect(back.updates[0].streakCount).toBe(0);
  });

  it("goes quiet between the escalation points, then reminds weekly", () => {
    const name = "Nasdaq consensus";
    // Session 2 of a `down` streak: already reported on session 1, not yet at 3.
    const quiet = decideAlerts(
      [h(name, "down")],
      [stored({ name, lastStatus: "down", streakCount: 1, lastAlertedDate: "2026-08-14" })],
      "2026-08-17",
    );
    expect(quiet.alerts).toHaveLength(0);

    // Session 3 speaks again.
    const third = decideAlerts(
      [h(name, "down")],
      [stored({ name, lastStatus: "down", streakCount: 2, lastAlertedDate: "2026-08-14" })],
      "2026-08-18",
    );
    expect(third.alerts).toHaveLength(1);

    // Then silence until a week has passed since the last message.
    const sixDays = decideAlerts(
      [h(name, "down")],
      [stored({ name, lastStatus: "down", streakCount: 6, lastAlertedDate: "2026-08-18" })],
      "2026-08-24",
    );
    expect(sixDays.alerts).toHaveLength(0);

    const sevenDays = decideAlerts(
      [h(name, "down")],
      [stored({ name, lastStatus: "down", streakCount: 7, lastAlertedDate: "2026-08-18" })],
      "2026-08-25",
    );
    expect(sevenDays.alerts).toHaveLength(1);
  });

  it("never alerts on empty or skipped", () => {
    // "FRED answered and nothing is scheduled" is a fact, not an outage; a
    // conditional source that legitimately did nothing is not a failure either.
    const d = decideAlerts(
      [h("FRED calendar", "empty"), h("Attribution", "skipped", "relevance ranked no names")],
      [],
      "2026-08-14",
    );
    expect(d.alerts).toHaveLength(0);
    expect(d.shouldSend).toBe(false);
  });
});

describe("missingFromRegistry", () => {
  it("flags a connector that stopped reporting at all", () => {
    // The failure no per-call error handler can see, because there is no call.
    const missing = missingFromRegistry([h("Yahoo quotes", "ok")]);
    expect(missing.every((m) => m.status === "degraded")).toBe(true);
    expect(missing.map((m) => m.name)).toContain("WSJ breadth");
    expect(missing.map((m) => m.name)).not.toContain("Yahoo quotes");
    expect(missing).toHaveLength(CONNECTOR_REGISTRY.length - 1);
  });
});

describe("formatDigest", () => {
  const all = [
    h("Nasdaq consensus", "down", "HTTP 403"),
    h("WSJ breadth", "degraded", "dated 2026-08-12, expected 2026-08-14"),
    h("Attribution", "skipped", "relevance ranked no names (SPDR holdings was down)"),
    h("FRED calendar", "ok"),
  ];

  it("separates down from degraded, and names the reason", () => {
    const decision = decideAlerts(all, [stored({ name: "WSJ breadth", lastStatus: "degraded", streakCount: 1 })], "2026-08-14");
    const text = formatDigest("2026-08-14", decision, all);
    expect(text).toContain("DOWN");
    expect(text).toContain("Nasdaq consensus — HTTP 403");
    expect(text).toContain("DEGRADED");
    expect(text).toContain("WSJ breadth — dated 2026-08-12");
    expect(text).toContain("OK: FRED calendar");
  });

  it("shows skipped entries only when the run has failures, so the cascade reads as one story", () => {
    const failing = decideAlerts(all, [], "2026-08-14");
    expect(formatDigest("2026-08-14", failing, all)).toContain("SKIPPED");

    const healthy = [h("Attribution", "skipped", "nothing ranked"), h("FRED calendar", "ok")];
    const clean = decideAlerts(healthy, [], "2026-08-14");
    expect(formatDigest("2026-08-14", clean, healthy)).not.toContain("SKIPPED");
  });
});
