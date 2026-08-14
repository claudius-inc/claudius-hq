import { describe, it, expect } from "vitest";
import { resolveSection } from "@/components/NavSectionSwitcher";

/** The Notes tab's sub-sections, as configured in MarketsTabs. */
const NOTES = [
  { href: "/markets/notes", label: "Daily" },
  { href: "/markets/notes/13f", label: "13F quarterly" },
  { href: "/markets/notes/settings", label: "Settings" },
];

describe("nav section resolution", () => {
  it("labels a daily note Daily", () => {
    expect(resolveSection(NOTES, "/markets/notes/2026-08-13")?.label).toBe("Daily");
  });

  it("labels the notes index Daily", () => {
    expect(resolveSection(NOTES, "/markets/notes")?.label).toBe("Daily");
  });

  it("labels a 13F period page 13F quarterly, not Daily", () => {
    // The regression this rule exists for: every note route begins with
    // /markets/notes, so a first-match rule files quarterlies under Daily.
    expect(resolveSection(NOTES, "/markets/notes/13f/2026-03-31")?.label).toBe("13F quarterly");
  });

  it("labels the 13F redirect route 13F quarterly", () => {
    expect(resolveSection(NOTES, "/markets/notes/13f")?.label).toBe("13F quarterly");
  });

  it("still resolves Settings", () => {
    expect(resolveSection(NOTES, "/markets/notes/settings")?.label).toBe("Settings");
  });

  it("does not match a sibling that merely shares a prefix", () => {
    expect(resolveSection(NOTES, "/markets/notes-archive")).toBeNull();
  });

  it("returns null outside the section", () => {
    expect(resolveSection(NOTES, "/markets/portfolio")).toBeNull();
  });
});
