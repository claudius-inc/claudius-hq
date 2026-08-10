/**
 * The session-half table (v2 §B). Yahoo's `earningsTimestamp` is a placeholder
 * stamped 08:30 ET for before-open reporters and 16:00 ET for after-close ones,
 * so an instant-in-interval test is wrong in BOTH directions: it misses every
 * before-open reporter, and it blames a report for the session that closed
 * before it. Each case below is one row of that table.
 */
import { describe, it, expect } from "vitest";
import { placeEarnings, isReactionDay } from "@/lib/notes/earnings-window";

const MARKET_DATE = "2026-08-07"; // a Friday
const PRIOR_SESSION = "2026-08-06";
const CLOSE_MINUTE = 16 * 60;

/** Epoch ms for an ET wall-clock time on an ET date (August ⇒ EDT, -04:00). */
const et = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00-04:00`);

function place(stamp: unknown, closeMinute = CLOSE_MINUTE) {
  return placeEarnings({ stamp, marketDate: MARKET_DATE, priorSessionDate: PRIOR_SESSION, closeMinute });
}

describe("placeEarnings", () => {
  it("today 08:30 ET → today is the reaction day (before-open reporter)", () => {
    expect(place(et(MARKET_DATE, "08:30"))).toBe("reaction-today-bmo");
  });

  it("prior session 16:00 ET → today is the reaction day (after-close reporter)", () => {
    expect(place(et(PRIOR_SESSION, "16:00"))).toBe("reaction-today-amc");
  });

  it("today 16:00 ET → after today's close; regular-session attribution is forbidden", () => {
    expect(place(et(MARKET_DATE, "16:00"))).toBe("after-todays-close");
  });

  it("a future stamp is not a report — the field rolls forward to the NEXT one", () => {
    expect(place(et("2026-08-21", "16:00"))).toBe("none");
  });

  it("a weekend stamp is unclassifiable", () => {
    expect(place(et("2026-08-08", "16:00"))).toBe("none");
  });

  it("a mid-session stamp is not a placeholder value, so it is not guessed at", () => {
    expect(place(et(MARKET_DATE, "12:00"))).toBe("none");
  });

  it("moves the close boundary on a half-day rather than assuming 16:00", () => {
    // A 13:00 close: a 13:00 stamp is after it, not mid-session.
    expect(place(et(MARKET_DATE, "13:00"), 13 * 60)).toBe("after-todays-close");
  });

  it("survives a malformed stamp instead of taking the whole note down with it", () => {
    // One bad field among 503 quotes must not reach the ET formatter and throw.
    expect(place("not a date")).toBe("none");
    expect(place(null)).toBe("none");
    expect(place(0)).toBe("none");
  });

  it("accepts epoch SECONDS, which is what the quote payload actually carries", () => {
    expect(place(et(MARKET_DATE, "08:30") / 1000)).toBe("reaction-today-bmo");
  });
});

describe("isReactionDay", () => {
  it("is true for both reaction rows and false for everything else", () => {
    expect(isReactionDay("reaction-today-bmo")).toBe(true);
    expect(isReactionDay("reaction-today-amc")).toBe(true);
    expect(isReactionDay("after-todays-close")).toBe(false);
    expect(isReactionDay("none")).toBe(false);
  });
});
