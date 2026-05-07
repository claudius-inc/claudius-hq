import { describe, it, expect } from "vitest";
import { titleCaseCompanyName } from "@/lib/text/title-case-company";
import { normalizeScannerName } from "@/lib/text/normalize-scanner-name";

describe("titleCaseCompanyName", () => {
  it("converts ALL CAPS to Title Case with Inc. as Title Case", () => {
    expect(titleCaseCompanyName("APPLE INC.")).toBe("Apple Inc.");
    expect(titleCaseCompanyName("TESLA, INC.")).toBe("Tesla, Inc.");
    expect(titleCaseCompanyName("VISTRA CORP.")).toBe("Vistra Corp.");
  });

  it("uses lowercase 'plc' (UK convention) and uppercase European suffixes", () => {
    expect(titleCaseCompanyName("RIO TINTO PLC")).toBe("Rio Tinto plc");
    expect(titleCaseCompanyName("ALLIANZ SE")).toBe("Allianz SE");
    expect(titleCaseCompanyName("VALE S.A.")).toBe("Vale S.A.");
    expect(titleCaseCompanyName("VOLKSWAGEN AG")).toBe("Volkswagen AG");
  });

  it("preserves canonical brand acronyms via the allowlist", () => {
    expect(titleCaseCompanyName("SMIC")).toBe("SMIC");
    expect(titleCaseCompanyName("CATL")).toBe("CATL");
    expect(titleCaseCompanyName("DBS")).toBe("DBS");
    expect(titleCaseCompanyName("BABA-W")).toBe("BABA-W");
    expect(titleCaseCompanyName("MARA HOLDINGS, INC.")).toBe("MARA Holdings, Inc.");
    expect(titleCaseCompanyName("MP MATERIALS CORP.")).toBe("MP Materials Corp.");
    expect(titleCaseCompanyName("NVIDIA CORPORATION")).toBe("NVIDIA Corporation");
    expect(titleCaseCompanyName("QUALCOMM INCORPORATED")).toBe("Qualcomm Incorporated");
  });

  it("title-cases hyphenated tokens piece by piece", () => {
    expect(titleCaseCompanyName("ROLLS-ROYCE HOLDINGS PLC")).toBe(
      "Rolls-Royce Holdings plc"
    );
    expect(titleCaseCompanyName("COCA-COLA FEMSA")).toBe("Coca-Cola Femsa");
  });

  it("lowercases particles between words", () => {
    expect(titleCaseCompanyName("BANK OF THE WEST")).toBe("Bank of the West");
    expect(titleCaseCompanyName("AMERICA MOVIL S.A.B. DE C.V.")).toBe(
      "America Movil S.A.B. de C.V."
    );
    expect(titleCaseCompanyName("SOCIEDAD QUIMICA Y MINERA S.A.")).toBe(
      "Sociedad Quimica y Minera S.A."
    );
  });

  it("preserves intentionally mixed-case brand tokens", () => {
    expect(titleCaseCompanyName("PayPal Holdings, Inc.")).toBe(
      "PayPal Holdings, Inc."
    );
    expect(titleCaseCompanyName("iPhone Maker Corp.")).toBe("iPhone Maker Corp.");
    expect(titleCaseCompanyName("MercadoLibre, Inc.")).toBe("MercadoLibre, Inc.");
    expect(titleCaseCompanyName("BeOne Medicines Ltd.")).toBe(
      "BeOne Medicines Ltd."
    );
  });

  it("strips trailing single-letter artifact after long whitespace", () => {
    expect(
      titleCaseCompanyName("ALLIANZ SE                    v")
    ).toBe("Allianz SE");
    expect(
      titleCaseCompanyName("RHEINMETALL AG                I")
    ).toBe("Rheinmetall AG");
  });

  it("collapses internal whitespace and trims", () => {
    expect(titleCaseCompanyName("  ACME    CORP  ")).toBe("Acme Corp");
  });

  it("uppercases dotted initialisms like S.A.B.", () => {
    expect(titleCaseCompanyName("s.a.b.")).toBe("S.A.B.");
  });

  it("handles empty / falsy inputs without throwing", () => {
    expect(titleCaseCompanyName("")).toBe("");
  });

  it("preserves common short brand acronyms even at start", () => {
    expect(titleCaseCompanyName("LG ENERGY SOLUTION LTD")).toBe(
      "LG Energy Solution Ltd"
    );
    expect(titleCaseCompanyName("SK HYNIX")).toBe("SK Hynix");
    expect(titleCaseCompanyName("NC SOFT")).toBe("NC Soft");
  });
});

describe("normalizeScannerName", () => {
  it("uses the override map when ticker matches", () => {
    expect(normalizeScannerName("005930.KS", "SamsungElec")).toBe(
      "Samsung Electronics Co., Ltd."
    );
    expect(normalizeScannerName("3483.T", "3483.T,0P0001CB5S,0")).toBe(
      "Takara Leben Real Estate Investment Corporation"
    );
    expect(normalizeScannerName("ALV.DE", "ALLIANZ SE                    v")).toBe(
      "Allianz SE"
    );
  });

  it("falls back to algorithmic title case when no override", () => {
    expect(normalizeScannerName("AAPL", "APPLE INC.")).toBe("Apple Inc.");
    expect(normalizeScannerName("ZZZZ", "TENCENT")).toBe("Tencent");
  });

  it("restores ticker case when the symbol appears in the name", () => {
    // Title-casing alone would lowercase short all-caps tokens like "AAPL" →
    // "Aapl". When the token is the ticker itself, restore its original case.
    expect(normalizeScannerName("AAPL", "Name of AAPL")).toBe("Name of AAPL");
    expect(normalizeScannerName("RIO.L", "Owner of RIO.L Plc")).toBe(
      "Owner of RIO.L plc"
    );
  });
});
