import { describe, it, expect } from "vitest";
import { resolveSection } from "@/components/NavSectionSwitcher";

/** The Notes tab's sub-sections, as configured in MarketsTabs. */
const NOTES = [
  { href: "/markets/notes", label: "All notes", root: true },
  { href: "/markets/notes/daily", label: "Daily" },
  { href: "/markets/notes/13f", label: "13F quarterly" },
  { href: "/markets/notes/settings", label: "Settings" },
];

/** What the tab prints: the section name alone on its own landing page. */
function trigger(pathname: string): string {
  const current = resolveSection(NOTES, pathname);
  return current && !current.root ? `Notes › ${current.label}` : "Notes";
}

describe("nav section resolution", () => {
  it("names a daily note", () => {
    expect(trigger("/markets/notes/daily/2026-08-13")).toBe("Notes › Daily");
  });

  it("names a 13F note", () => {
    expect(trigger("/markets/notes/13f/2026-03-31")).toBe("Notes › 13F quarterly");
  });

  it("names Settings", () => {
    expect(trigger("/markets/notes/settings")).toBe("Notes › Settings");
  });

  it("shows the plain section name on the archive index", () => {
    // The regression: the archive matched the Daily entry back when Daily was
    // /markets/notes, so the index announced itself as a daily note.
    expect(trigger("/markets/notes")).toBe("Notes");
  });

  it("does not claim a weekly wrap is a daily note", () => {
    // Weekly has no entry of its own, so it must fall back to the section name
    // rather than borrowing a sibling's label.
    expect(trigger("/markets/notes/weekly/2026-08-07")).toBe("Notes");
  });

  it("keeps the archive reachable from the menu", () => {
    // `root` changes only what the trigger prints; the entry is still a real
    // section, and the tab is not a link once it has sub-tabs.
    expect(resolveSection(NOTES, "/markets/notes")?.href).toBe("/markets/notes");
  });

  it("prefers the deepest match", () => {
    // /markets/notes/daily/... matches both the archive and Daily.
    expect(resolveSection(NOTES, "/markets/notes/daily/2026-08-13")?.label).toBe("Daily");
  });

  it("does not match a sibling that merely shares a prefix", () => {
    expect(resolveSection(NOTES, "/markets/notes-archive")).toBeNull();
  });

  it("returns null outside the section", () => {
    expect(resolveSection(NOTES, "/markets/portfolio")).toBeNull();
  });
});
