import { describe, it, expect } from "vitest";
import { resolveFilter, filterHref } from "@/app/markets/notes/_lib/filter";

describe("archive type filter", () => {
  it("accepts every kind it offers", () => {
    expect(resolveFilter("daily")).toBe("daily");
    expect(resolveFilter("weekly")).toBe("weekly");
    expect(resolveFilter("13f")).toBe("13f");
    expect(resolveFilter("all")).toBe("all");
  });

  it("falls back to All rather than erroring", () => {
    // A hand-edited or stale link should land on the archive, not a 404.
    expect(resolveFilter(undefined)).toBe("all");
    expect(resolveFilter("")).toBe("all");
    expect(resolveFilter("quarterly")).toBe("all");
    expect(resolveFilter("DAILY")).toBe("all");
    expect(resolveFilter("../../etc")).toBe("all");
  });

  it("keeps All on the bare route so the default URL stays clean", () => {
    expect(filterHref("all")).toBe("/markets/notes");
  });

  it("uses the same key in the URL as the route those notes live at", () => {
    expect(filterHref("13f")).toBe("/markets/notes?kind=13f");
    expect(filterHref("daily")).toBe("/markets/notes?kind=daily");
    expect(filterHref("weekly")).toBe("/markets/notes?kind=weekly");
  });
});
