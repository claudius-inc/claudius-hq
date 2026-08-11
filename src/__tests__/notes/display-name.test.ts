/**
 * The company-name normaliser.
 *
 * The input is SPDR holdings-file text: all-caps, fixed-width padded, with a
 * legal form and sometimes a share class glued on the end. The failure modes
 * that matter are all destructive — stripping so eagerly that a name becomes
 * empty ("APA CORP"), or so timidly that "INC   A" survives — so they are
 * pinned here rather than left to a visual check on one day's holdings.
 */
import { describe, it, expect } from "vitest";
import { displayName } from "@/lib/notes/display-name";

describe("displayName", () => {
  it("title-cases and drops the legal form", () => {
    expect(displayName("APPLE INC")).toBe("Apple");
    expect(displayName("MARATHON PETROLEUM CORP")).toBe("Marathon Petroleum");
    expect(displayName("KINDER MORGAN INC")).toBe("Kinder Morgan");
  });

  it("collapses fixed-width padding before stripping the share class", () => {
    // Without the whitespace collapse the trailing-noise pattern never matches,
    // and the name renders as "Crowdstrike Holdings Inc   A".
    expect(displayName("CROWDSTRIKE HOLDINGS INC   A")).toBe("Crowdstrike");
    expect(displayName("DATADOG INC   CLASS A")).toBe("Datadog");
    expect(displayName("AIRBNB INC CLASS A")).toBe("Airbnb");
  });

  it("never strips a name down to nothing", () => {
    // "APA CORP" is the live case: strip "CORP" and the remainder is a token
    // that is itself in the legal-form list only by coincidence of length.
    expect(displayName("APA CORP")).toBe("APA");
    expect(displayName("SEMPRA")).toBe("Sempra");
    expect(displayName("INC")).toBe("Inc");
  });

  it("keeps acronyms upper-case and known brands in their own casing", () => {
    expect(displayName("NRG ENERGY INC")).toBe("NRG Energy");
    expect(displayName("NVIDIA CORP")).toBe("NVIDIA");
    expect(displayName("NETAPP INC")).toBe("NetApp");
    expect(displayName("COSTAR GROUP INC")).toBe("CoStar");
  });

  it("drops a leading article left dangling by the stripped legal form", () => {
    // "THE CIGNA GROUP" minus "GROUP" reads as "The Cigna"; the company is Cigna.
    expect(displayName("THE CIGNA GROUP")).toBe("Cigna");
  });

  it("returns null for an absent name so the caller can fall back to the ticker", () => {
    expect(displayName(null)).toBeNull();
    expect(displayName(undefined)).toBeNull();
    expect(displayName("   ")).toBeNull();
  });

  it("leaves a multi-word name that carries no legal form intact", () => {
    expect(displayName("ADVANCED MICRO DEVICES")).toBe("Advanced Micro Devices");
    expect(displayName("WEST PHARMACEUTICAL SERVICES")).toBe("West Pharmaceutical Services");
  });
});
