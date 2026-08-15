/**
 * The direction check has to run at RENDER, not only at write.
 *
 * `write.ts` drops a contradicting field for every note written from now on and
 * for no note already in the archive. The 2026-08-14 bear case — "The index's
 * gain is hostage to a cluster of mega-caps" on a session that closed -0.17% —
 * is persisted, and this page renders persisted prose verbatim, so the write-time
 * fix alone leaves the false claim standing forever on the page whose whole job
 * is to keep the archive.
 *
 * The same argument `gamma-stance.ts` makes for the inverted-sign era.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TheRead } from "@/app/markets/notes/daily/[date]/_components/TheRead";
import type { StructuredFacts, NoteProse } from "@/lib/notes/types";

/** The S&P fell 0.17% — the real 2026-08-14 close. */
const DOWN_FACTS = {
  date: "2026-08-14",
  indices: {
    value: [{ symbol: "^GSPC", name: "S&P 500", close: 7785.76, changePct: -0.17 }],
    source: "Yahoo",
    asOf: "2026-08-14T20:00:00Z",
  },
  gexPin: null,
} as unknown as StructuredFacts;

const prose = (p: Partial<NoteProse>): NoteProse => ({ hook: "h", whatMatters: [], ...p });

function text(p: Partial<NoteProse>): string {
  return renderToStaticMarkup(<TheRead facts={DOWN_FACTS} prose={prose(p)} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

describe("TheRead direction check", () => {
  const BAD_BEAR =
    "The index's gain is hostage to a cluster of mega-caps, while retail sales already point to consumer strain.";
  const GOOD_BULL = "Small caps and advancers tell a broader risk-on story.";

  it("withholds an archived bear case that contradicts the close", () => {
    const rendered = text({ bull: GOOD_BULL, bear: BAD_BEAR });
    expect(rendered).not.toContain("hostage");
    expect(rendered).toContain("Bear — withheld");
  });

  it("STATES the withholding rather than dropping it silently", () => {
    // A lone bull card with no explanation reads as "there is no bear case",
    // which is a far stronger claim than "the one we wrote failed a check".
    const rendered = text({ bull: GOOD_BULL, bear: BAD_BEAR });
    expect(rendered).toMatch(/opposite way from its own close/);
    expect(rendered).toContain("-0.17%");
  });

  it("leaves the surviving side of the pair alone", () => {
    expect(text({ bull: GOOD_BULL, bear: BAD_BEAR })).toContain("risk-on story");
  });

  it("renders both cases untouched when neither contradicts the close", () => {
    const rendered = text({ bull: GOOD_BULL, bear: "The index drop is broad-based." });
    expect(rendered).toContain("risk-on story");
    expect(rendered).toContain("broad-based");
    expect(rendered).not.toContain("withheld");
  });

  it("filters a contradicting what-matters bullet and says how many went", () => {
    const rendered = text({
      whatMatters: ["The index drop is narrow.", "The market's gain was broad."],
    });
    expect(rendered).toContain("The index drop is narrow");
    expect(rendered).not.toContain("gain was broad");
    expect(rendered).toMatch(/1 further point withheld/);
  });
});

describe("TheRead claim splitting", () => {
  it("joins a subordinate clause instead of leaving a sentence fragment", () => {
    // The model satisfies its "Claim. Evidence." mandate with a subordinate
    // clause about a third of the time; splitting on the full stop then renders
    // a visible fragment starting "Because …", which reads as a truncation bug.
    const rendered = text({
      whatMatters: ["The index drop is narrow. Because ex the top five movers the S&P is positive."],
    });
    expect(rendered).toContain("The index drop is narrow because ex the top five movers");
    expect(rendered).not.toMatch(/narrow\.\s*Because/);
  });

  it("still splits an ordinary two-sentence claim", () => {
    const rendered = text({
      whatMatters: ["Retail sales are soft. The month came in below consensus."],
    });
    expect(rendered).toContain("Retail sales are soft.");
    expect(rendered).toContain("The month came in below consensus.");
  });
});
