/**
 * The holdings files write an ampersand as a plus, and the legal-form stripper
 * used to leave it stranded.
 *
 * "ELI LILLY + CO" lost its "CO" tail and rendered as "Eli Lilly +" — live on
 * the 2026-08-14 note, in the Concentration contributors row. The plus is the
 * SPDR export's ampersand, so it is restored rather than deleted, and whatever
 * the tail strip orphans is trimmed afterwards.
 */
import { describe, it, expect } from "vitest";
import { displayName } from "@/lib/notes/display-name";

describe("displayName", () => {
  it("does not strand the conjunction when the legal form is stripped", () => {
    expect(displayName("ELI LILLY + CO")).toBe("Eli Lilly");
  });

  it("keeps an ampersand that joins two real parts of the name", () => {
    expect(displayName("JOHNSON + JOHNSON")).toBe("Johnson & Johnson");
  });

  it("still strips stacked legal-form and share-class tails", () => {
    expect(displayName("FOX CORP   CLASS A")).toBe("Fox");
    expect(displayName("META PLATFORMS INC CLASS A")).toBe("Meta Platforms");
    expect(displayName("CROWDSTRIKE HOLDINGS INC   A")).toBe("Crowdstrike");
  });

  it("keeps a brand's own casing", () => {
    expect(displayName("SANDISK CORP")).toBe("SanDisk");
    expect(displayName("NETAPP INC")).toBe("NetApp");
  });

  it("never empties a name that is mostly legal form", () => {
    // "APA CORP" must not become "" — the guard the tail loop already had, now
    // also required of the trailing-punctuation trim.
    expect(displayName("APA CORP")).toBe("APA");
  });

  it("leaves an internal dot alone", () => {
    expect(displayName("AMAZON.COM INC")).toBe("Amazon.com");
  });

  it("returns null for nothing, so the caller can fall back to the ticker", () => {
    expect(displayName("")).toBeNull();
    expect(displayName(null)).toBeNull();
    expect(displayName(undefined)).toBeNull();
  });
});
