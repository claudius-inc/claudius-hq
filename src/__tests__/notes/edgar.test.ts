/**
 * EDGAR 8-K — rung 4 of the §B ladder.
 *
 * The shape here was verified against the live API, not assumed: `filings.recent`
 * is a set of PARALLEL ARRAYS, `items` is a comma-separated string, and
 * `acceptanceDateTime` is ISO with a Z. Every fixture below mirrors a real
 * response, including AKAM's actual 2026-08-06 earnings 8-K ("2.02,9.01"
 * accepted 20:07:38Z).
 *
 * Two traps carry most of the risk: a filing accepted AFTER the close would
 * attach a cause to a session that had already ended, and an 8-K/A amendment
 * would attach today's move to news from weeks ago.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchCikMap, fetchCausalEightK, inReactionWindow } from "@/lib/notes/sources/edgar";

const CLOSE_MINUTE = 16 * 60;
const MARKET_DATE = "2026-08-06";
const PRIOR_SESSION = "2026-08-05";

/** August ⇒ EDT, so 16:07 ET is 20:07Z. */
const accepted = (utc: string) => `${utc}.000Z`;

/** Every call the module made, so headers and URLs can be asserted. */
let calls: { url: string; init?: RequestInit }[] = [];

function mockFetch(handler: (url: string) => unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = handler(String(url));
    if (body == null) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  });
}

function submissions(rows: { form: string; items: string; acceptanceDateTime: string }[]) {
  return {
    filings: {
      recent: {
        form: rows.map((r) => r.form),
        items: rows.map((r) => r.items),
        acceptanceDateTime: rows.map((r) => r.acceptanceDateTime),
      },
    },
  };
}

const original = global.fetch;
beforeEach(() => {
  calls = [];
  // Load-bearing: the throttle sleeps between requests, and without advancing
  // timers the suite would hang rather than fail.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  global.fetch = original;
  vi.useRealTimers();
});

describe("SEC request discipline", () => {
  it("sends a User-Agent that identifies the requester — SEC blocks anonymous agents", async () => {
    global.fetch = mockFetch(() => ({})) as unknown as typeof fetch;
    await fetchCikMap();
    const ua = (calls[0]?.init?.headers as Record<string, string>)?.["User-Agent"];
    expect(ua).toBeTruthy();
    // Identity plus a contact address is what the policy actually asks for.
    expect(ua).toMatch(/@/);
  });

  it("builds the submissions URL from the zero-padded CIK", async () => {
    global.fetch = mockFetch(() => ({})) as unknown as typeof fetch;
    await fetchCausalEightK("AKAM", "0001086222", MARKET_DATE, PRIOR_SESSION, CLOSE_MINUTE);
    expect(calls[0]?.url).toBe("https://data.sec.gov/submissions/CIK0001086222.json");
  });
});

describe("inReactionWindow", () => {
  const ok = (utc: string) =>
    inReactionWindow(Date.parse(accepted(utc)), MARKET_DATE, PRIOR_SESSION, CLOSE_MINUTE);

  it("accepts today up to, but not including, the closing minute", () => {
    expect(ok("2026-08-06T13:30:00")).toBe(true); // 09:30 ET
    expect(ok("2026-08-06T19:59:00")).toBe(true); // 15:59 ET
    // 16:00:xx is the bell. etMinutes truncates seconds, so an inclusive bound
    // would admit a full minute of post-close filings.
    expect(ok("2026-08-06T20:00:00")).toBe(false);
    expect(ok("2026-08-06T20:00:59")).toBe(false);
  });

  it("accepts the overnight band after the PRIOR session's close", () => {
    // The band a same-day window left unowned: yesterday's note called it
    // post-close, today's called it the wrong date.
    expect(ok("2026-08-05T20:15:00")).toBe(true); // 16:15 ET yesterday
    expect(ok("2026-08-05T23:00:00")).toBe(true); // 19:00 ET yesterday
  });

  it("rejects the prior session's own trading hours — that was yesterday's move", () => {
    expect(ok("2026-08-05T15:00:00")).toBe(false); // 11:00 ET yesterday
  });

  it("rejects anything before the prior session and after today's close", () => {
    expect(ok("2026-08-04T20:30:00")).toBe(false);
    expect(ok("2026-08-06T21:00:00")).toBe(false);
  });

  it("has no overnight band when the prior session is unknown", () => {
    expect(inReactionWindow(Date.parse(accepted("2026-08-05T20:15:00")), MARKET_DATE, null, CLOSE_MINUTE)).toBe(
      false,
    );
  });
});

describe("fetchCikMap", () => {
  it("zero-pads the CIK and indexes both the dash and dot spellings", async () => {
    global.fetch = mockFetch(() => ({
      "0": { cik_str: 1086222, ticker: "AKAM" },
      "1": { cik_str: 1067983, ticker: "BRK-B" },
    })) as unknown as typeof fetch;
    const map = await fetchCikMap();
    expect(map.get("AKAM")).toBe("0001086222");
    // SPDR holdings write share classes with a dot; EDGAR uses a dash.
    expect(map.get("BRK-B")).toBe("0001067983");
    expect(map.get("BRK.B")).toBe("0001067983");
  });

  it("returns an empty map rather than throwing when EDGAR is unreachable", async () => {
    global.fetch = mockFetch(() => null) as unknown as typeof fetch;
    expect((await fetchCikMap()).size).toBe(0);
  });
});

describe("fetchCausalEightK", () => {
  const run = (rows: Parameters<typeof submissions>[0]) => {
    global.fetch = mockFetch(() => submissions(rows)) as unknown as typeof fetch;
    return fetchCausalEightK("AKAM", "0001086222", MARKET_DATE, PRIOR_SESSION, CLOSE_MINUTE);
  };

  it("finds a causal item filed during the session", async () => {
    const r = await run([
      { form: "8-K", items: "5.02,9.01", acceptanceDateTime: accepted("2026-08-06T13:30:00") },
    ]);
    // "officers or directors", NOT "a leadership change". The feed gives a bare
    // code with no sub-paragraph, and 5.02 covers a CEO resigning, the annual
    // director election and this year's comp grants alike. Naming the category
    // is true of all three; naming an event would be false on most days.
    expect(r).toMatchObject({ item: "5.02", what: "officers or directors" });
  });

  it("never phrases an item as an event it cannot distinguish", async () => {
    for (const items of ["5.02", "1.01", "3.01"]) {
      const r = await run([{ form: "8-K", items, acceptanceDateTime: accepted("2026-08-06T13:00:00") }]);
      expect(r?.what).not.toMatch(/leadership change|delisting|acquisition/i);
    }
  });

  it("attributes an overnight filing to today, the session that reacts to it", async () => {
    const r = await run([
      { form: "8-K", items: "2.01", acceptanceDateTime: accepted("2026-08-05T21:00:00") }, // 17:00 ET
    ]);
    expect(r).toMatchObject({ item: "2.01" });
  });

  it("ignores a filing accepted AFTER the close — a cause cannot post-date its effect", async () => {
    // AKAM's real earnings 8-K: accepted 20:07:38Z = 16:07 ET, seven minutes
    // after the bell. It did not move the session that had already closed.
    const r = await run([
      { form: "8-K", items: "2.02,9.01", acceptanceDateTime: accepted("2026-08-06T20:07:38") },
    ]);
    expect(r).toBeNull();
  });

  it("ignores a filing from another day", async () => {
    const r = await run([
      { form: "8-K", items: "2.01", acceptanceDateTime: accepted("2026-08-05T14:00:00") },
    ]);
    expect(r).toBeNull();
  });

  it("ignores an 8-K/A amendment, which re-files old news under a new stamp", async () => {
    const r = await run([
      { form: "8-K/A", items: "2.01", acceptanceDateTime: accepted("2026-08-06T13:00:00") },
    ]);
    expect(r).toBeNull();
  });

  it("ignores catch-all items that assert a category without content", async () => {
    // 7.01 Reg FD, 8.01 Other Events, 9.01 Exhibits — attached to filings about
    // anything at all, so "an 8-K on other events" would be a cause with no
    // information in it.
    const r = await run([
      { form: "8-K", items: "7.01,8.01,9.01", acceptanceDateTime: accepted("2026-08-06T13:00:00") },
    ]);
    expect(r).toBeNull();
  });

  it("describes a multi-item filing by its most significant item", async () => {
    const r = await run([
      { form: "8-K", items: "1.01,2.01,9.01", acceptanceDateTime: accepted("2026-08-06T13:00:00") },
    ]);
    expect(r?.item).toBe("2.01");
  });

  it("returns one cause per ticker even when the day carried several filings", async () => {
    const r = await run([
      { form: "8-K", items: "1.01", acceptanceDateTime: accepted("2026-08-06T12:00:00") },
      { form: "8-K", items: "5.02", acceptanceDateTime: accepted("2026-08-06T13:00:00") },
    ]);
    expect(r?.item).toBe("5.02");
  });

  it("moves the boundary on a half-day rather than assuming 16:00", async () => {
    global.fetch = mockFetch(() =>
      submissions([{ form: "8-K", items: "5.02", acceptanceDateTime: accepted("2026-08-06T17:30:00") }]),
    ) as unknown as typeof fetch;
    // 17:30Z = 13:30 ET. Inside a normal session, after a 13:00 half-day close.
    expect(await fetchCausalEightK("AKAM", "0001086222", MARKET_DATE, PRIOR_SESSION, 16 * 60)).not.toBeNull();
    expect(await fetchCausalEightK("AKAM", "0001086222", MARKET_DATE, PRIOR_SESSION, 13 * 60)).toBeNull();
  });

  it("survives a malformed acceptance stamp instead of taking the note down", async () => {
    const r = await run([{ form: "8-K", items: "5.02", acceptanceDateTime: "not a date" }]);
    expect(r).toBeNull();
  });

  it("returns null when EDGAR has no recent filings block", async () => {
    global.fetch = mockFetch(() => ({})) as unknown as typeof fetch;
    expect(await fetchCausalEightK("AKAM", "0001086222", MARKET_DATE, PRIOR_SESSION, CLOSE_MINUTE)).toBeNull();
  });
});
