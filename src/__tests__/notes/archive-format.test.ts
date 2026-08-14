import { describe, it, expect } from "vitest";
import { shortDayDate } from "@/app/markets/notes/daily/[date]/_lib/format";

describe("shortDayDate", () => {
  it("prints the weekday instead of the year", () => {
    expect(shortDayDate("2026-08-13")).toBe("Aug 13, Thu");
  });

  it("names the weekday correctly across the week", () => {
    expect(shortDayDate("2026-08-10")).toBe("Aug 10, Mon");
    expect(shortDayDate("2026-08-14")).toBe("Aug 14, Fri");
  });

  it("reads the ISO date literally, not in the runner's zone", () => {
    // Anchored at noon UTC so a machine behind UTC cannot roll the date back a
    // day — the bug that would silently rename every Monday note to Sunday.
    expect(shortDayDate("2026-01-01")).toBe("Jan 1, Thu");
    expect(shortDayDate("2025-12-31")).toBe("Dec 31, Wed");
  });
});
