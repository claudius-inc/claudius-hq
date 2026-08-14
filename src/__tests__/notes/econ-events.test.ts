/**
 * The forward calendar's two silent failures.
 *
 * Neither shows up in a log, and both only appear once the FOMC is in the list —
 * which is why they survived until the FOMC dates were added. Every whitelisted
 * FRED release prints at 8:30, so the section had never carried an event at any
 * other hour, and it had never had a fifth event worth keeping.
 */
import { describe, it, expect } from "vitest";
import { orderEvents } from "@/lib/notes/sources/fred-releases";
import type { EconEvent } from "@/lib/notes/types";

const at = (name: string, date: string, timeEt: string): EconEvent => ({ name, date, timeEt });

describe("orderEvents", () => {
  it("sorts an afternoon event after a morning one on the same day", () => {
    // "14:00" < "8:30" as plain strings, so the naive `date + timeEt` compare
    // put the 2pm decision ahead of the 8:30 print.
    const out = orderEvents([at("FOMC decision", "2026-09-16", "14:00"), at("CPI", "2026-09-16", "8:30")]);
    expect(out.map((e) => e.name)).toEqual(["CPI", "FOMC decision"]);
  });

  it("keeps the FOMC on a week too crowded to fit it", () => {
    // The decision is last in time, so a plain top-4 slice drops exactly the
    // event the week is about.
    const out = orderEvents([
      at("CPI", "2026-09-14", "8:30"),
      at("PPI", "2026-09-15", "8:30"),
      at("Retail sales", "2026-09-15", "8:30"),
      at("Jobless claims", "2026-09-16", "8:30"),
      at("Employment Situation", "2026-09-16", "8:30"),
      at("FOMC decision + projections", "2026-09-16", "14:00"),
    ]);
    expect(out.map((e) => e.name)).toContain("FOMC decision + projections");
    expect(out).toHaveLength(4);
    // Still in time order after the FOMC is spliced back in.
    expect(out[out.length - 1].name).toBe("FOMC decision + projections");
  });

  it("does not grow the list beyond the cap when two decisions land in one window", () => {
    const out = orderEvents([
      at("FOMC decision", "2026-09-16", "14:00"),
      at("FOMC decision + projections", "2026-09-17", "14:00"),
      at("CPI", "2026-09-14", "8:30"),
      at("PPI", "2026-09-15", "8:30"),
      at("Jobless claims", "2026-09-15", "8:30"),
    ]);
    expect(out).toHaveLength(4);
    expect(out.filter((e) => e.name.startsWith("FOMC"))).toHaveLength(2);
  });

  it("falls back to the raw string rather than dropping an unparseable time", () => {
    const out = orderEvents([at("Odd", "2026-09-16", "half eight"), at("CPI", "2026-09-16", "8:30")]);
    expect(out).toHaveLength(2);
  });
});
