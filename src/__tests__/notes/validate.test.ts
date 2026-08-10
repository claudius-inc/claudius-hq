/**
 * §1b enforcement — the note's flagship honesty rule, and the one whose failure
 * mode is invisible. A leak ships an invented cause; an over-match silently
 * deletes a legitimate bullet. Neither shows up in a log you would read.
 */
import { describe, it, expect } from "vitest";
import { checkCausalRule, collectProseSubjects, collectAllowedNumbers } from "@/lib/notes/validate";
import type { StructuredFacts } from "@/lib/notes/types";

/** A facts object with only the fields a test cares about. */
function facts(partial: Partial<StructuredFacts>): StructuredFacts {
  return {
    date: "2026-08-07",
    generatedAt: "2026-08-07T22:15:00Z",
    indices: null,
    rates: null,
    vix: null,
    crossAsset: null,
    sectors: null,
    breadth: null,
    divergence: null,
    contribution: null,
    gexPin: null,
    econEvents: null,
    spotlight: null,
    postMarket: null,
    timeframes: null,
    macro: null,
    movers: null,
    attributions: null,
    companyNames: null,
    ...partial,
  };
}

const fact = <T,>(value: T) => ({ value, source: "test", asOf: "2026-08-07T20:00:00Z" });

describe("collectProseSubjects", () => {
  it("carries both the ticker and a usable form of the company name", () => {
    const subjects = collectProseSubjects(
      facts({
        movers: fact([{ ticker: "AKAM", changePct: -6.8 }]),
        companyNames: { AKAM: "Akamai Technologies Inc" },
      }),
    );
    expect(subjects).toContain("AKAM");
    expect(subjects).toContain("Akamai Technologies");
  });

  it("strips share-class markers so the alias is the form a writer would use", () => {
    const subjects = collectProseSubjects(
      facts({
        movers: fact([{ ticker: "GOOGL", changePct: 2.1 }]),
        companyNames: { GOOGL: "Alphabet Inc. Class A" },
      }),
    );
    expect(subjects).toContain("Alphabet");
  });

  it("drops aliases under four characters — 'Gap' is an ordinary word in market prose", () => {
    const subjects = collectProseSubjects(
      facts({
        movers: fact([{ ticker: "GAP", changePct: -3.2 }]),
        companyNames: { GAP: "Gap Inc." },
      }),
    );
    expect(subjects).toContain("GAP");
    expect(subjects).not.toContain("Gap");
  });

  it("carries BOTH spellings of a share class", () => {
    // The fact sheet shows the model Yahoo's spelling wherever a figure came
    // from a price series, while stored tickers use the SPDR form. A subject
    // list holding only one of the two is a spelling preference, not a rule:
    // \bBRK\.B\b does not match BRK-B.
    const subjects = collectProseSubjects(facts({ movers: fact([{ ticker: "BRK.B", changePct: 2.1 }]) }));
    expect(subjects).toContain("BRK.B");
    expect(subjects).toContain("BRK-B");
  });

  it("ignores a name for a ticker the note never mentions", () => {
    const subjects = collectProseSubjects(facts({ companyNames: { AKAM: "Akamai Technologies Inc" } }));
    expect(subjects).toEqual([]);
  });
});

describe("checkCausalRule", () => {
  const subjects = ["AKAM", "Akamai Technologies"];

  it("passes a field that names nothing", () => {
    expect(checkCausalRule("Breadth was negative because the mega-caps carried it.", subjects).ok).toBe(true);
  });

  it("passes a field that names an instrument without asserting a mechanism", () => {
    expect(checkCausalRule("AKAM closed at the bottom of the board.", subjects).ok).toBe(true);
  });

  it("fails a ticker beside a causal connective", () => {
    const r = checkCausalRule("AKAM fell after the print.", subjects);
    expect(r.ok).toBe(false);
    expect(r.subject).toBe("AKAM");
  });

  it("fails the company NAME beside a causal connective — the leak a ticker-only test left open", () => {
    const r = checkCausalRule("Akamai Technologies slid as Washington floated export curbs.", subjects);
    expect(r.ok).toBe(false);
    expect(r.subject).toBe("Akamai Technologies");
  });

  it("is scoped to the field, so splitting across sentences does not escape it", () => {
    // Bullets are a two-sentence "Claim. Evidence." form, which would make this
    // split the natural way to satisfy the because-mandate under sentence scope.
    expect(checkCausalRule("AKAM closed -6.8%. It fell after a downgrade.", subjects).ok).toBe(false);
  });

  it("allows 'despite' — contrastive, asserts no mechanism, and the bullet mandate leans on it", () => {
    expect(checkCausalRule("AKAM held its bid despite the sector selling off.", subjects).ok).toBe(true);
  });

  it("catches the inferential group, which invents a mechanism for the second name", () => {
    expect(checkCausalRule("AKAM plunged, so its peers sold off.", subjects).ok).toBe(false);
  });
});

describe("collectAllowedNumbers", () => {
  it("pools mover percentages, which MOVERS prints deterministically", () => {
    const allowed = collectAllowedNumbers(facts({ movers: fact([{ ticker: "AKAM", changePct: -6.8 }]) }));
    expect(allowed).toContain(6.8);
  });

  it("withholds EPS figures, so a bullet citing one fails automatically (§H0.1)", () => {
    const allowed = collectAllowedNumbers(
      facts({
        attributions: fact([
          {
            ticker: "AKAM",
            rung: "earnings" as const,
            verb: "after" as const,
            phrase: "AKAM fell -6.8% after reporting EPS $1.59",
            epsActual: 1.59,
            epsEstimate: 1.58,
          },
        ]),
      }),
    );
    expect(allowed).not.toContain(1.59);
    expect(allowed).not.toContain(1.58);
  });
});
