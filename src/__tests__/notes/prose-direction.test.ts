/**
 * The direction check — §8.3's blind spot.
 *
 * Every numeral in a field can map to a fact and the field can still say the
 * opposite of what happened. On 2026-08-14 the bear case shipped as "The
 * index's GAIN is hostage to a cluster of mega-caps" on a session that closed
 * -0.17%: it cites no numbers at all, so the numeral pool had nothing to check,
 * and neither the causal rule nor the lexicon looks at direction.
 *
 * The check is DEFAULT-ALLOW, which is the opposite of every other guard in
 * `validate.ts`, so most of what follows is about what it must NOT drop — a
 * false positive silently deletes a legitimate bullet.
 */
import { describe, it, expect } from "vitest";
import { checkDirection, indexChangePct } from "@/lib/notes/validate";
import type { StructuredFacts } from "@/lib/notes/types";

const DOWN_DAY = -0.17;
const UP_DAY = 0.42;

describe("checkDirection", () => {
  it("drops a field claiming a gain on a session that fell", () => {
    const r = checkDirection(
      "The index's gain is hostage to a cluster of mega-caps, while retail sales already point to consumer strain.",
      DOWN_DAY,
    );
    expect(r.ok).toBe(false);
    expect(r.said).toBe("up");
  });

  it("drops a field claiming a decline on a session that rose", () => {
    const r = checkDirection("The S&P 500 sold off as breadth deteriorated.", UP_DAY);
    expect(r.ok).toBe(false);
    expect(r.said).toBe("down");
  });

  it("keeps a field whose direction agrees with the close", () => {
    expect(checkDirection("The index drop is narrow.", DOWN_DAY).ok).toBe(true);
    expect(checkDirection("The market rallied on thin volume.", UP_DAY).ok).toBe(true);
  });

  it("keeps a MIXED field, where a timeframe qualifies one of the directions", () => {
    // "up 3.6% over 21 sessions but lower today" is a legitimate claim on a down
    // day. Skipping mixed fields is also the cheap way to avoid parsing which
    // clause a timeframe qualifies — the alternative is a grammar.
    expect(
      checkDirection("The S&P is up 3.6% over 21 sessions but closed lower today.", DOWN_DAY).ok,
    ).toBe(true);
  });

  it("keeps a field about a sector or a name, which the index sign cannot contradict", () => {
    // Energy rising on a day the index fell is ordinary, not a contradiction.
    expect(checkDirection("Energy strength is narrow because refiners moved lower.", DOWN_DAY).ok).toBe(
      true,
    );
    expect(checkDirection("Small caps and advancers tell a broader risk-on story.", DOWN_DAY).ok).toBe(
      true,
    );
  });

  it("keeps everything on a near-flat close, which has no direction to contradict", () => {
    expect(checkDirection("The index's gain was broad.", 0.01).ok).toBe(true);
  });

  it("is skipped entirely when the index close is unknown", () => {
    expect(checkDirection("The index's gain was broad.", null).ok).toBe(true);
  });

  it("does not read 'advancers' as an advance", () => {
    // Breadth nouns share a stem with direction verbs, and a false positive here
    // would drop the bull case on most broad-breadth days.
    expect(checkDirection("The market saw 1,447 advancers.", DOWN_DAY).ok).toBe(true);
  });
});

describe("indexChangePct", () => {
  const facts = (indices: unknown) => ({ indices }) as unknown as StructuredFacts;

  it("reads the S&P, not whichever index is listed first", () => {
    const f = facts({
      value: [
        { symbol: "^IXIC", name: "Nasdaq", close: 1, changePct: -0.28 },
        { symbol: "^GSPC", name: "S&P 500", close: 2, changePct: -0.17 },
      ],
      source: "t",
      asOf: "t",
    });
    expect(indexChangePct(f)).toBe(-0.17);
  });

  it("is null when indices are absent, so the check disables itself", () => {
    expect(indexChangePct(facts(null))).toBeNull();
  });
});
