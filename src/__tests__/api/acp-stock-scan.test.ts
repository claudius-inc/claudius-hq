import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeRows = [
  { ticker: "AAPL",  name: "Apple", market: "US",  price: 180, momentumScore: 82, technicalScore: 75, priceChange1w: 1.2,  priceChange1m: 4.5, priceChange3m: 8.0, themeIds: "[1]", dataQuality: "ok", computedAt: "2026-05-03T12:00:00Z" },
  { ticker: "D05.SI", name: "DBS",   market: "SGX", price: 35,  momentumScore: 40, technicalScore: 50, priceChange1w: -0.5, priceChange1m: 1.0, priceChange3m: 2.0, themeIds: "[2]", dataQuality: "ok", computedAt: "2026-05-03T12:00:00Z" },
];
const fakeThemes = [{ id: 1, name: "AI" }, { id: 2, name: "SG Banks" }];

vi.mock("@/db", () => {
  const watchlistScores = { ticker: "ticker", momentumScore: "momentum_score" };
  const themes = { id: "id", name: "name" };
  // Two distinct select() return shapes — the watchlist call uses .from().orderBy(),
  // the themes call uses .from() returning the rows directly via thenable.
  let callIndex = 0;
  return {
    db: {
      select: vi.fn(() => {
        callIndex++;
        if (callIndex % 2 === 1) {
          // watchlistScores call
          return {
            from: vi.fn(() => ({
              orderBy: vi.fn(async () => fakeRows),
            })),
          };
        } else {
          // themes call
          return {
            from: vi.fn(async () => fakeThemes),
          };
        }
      }),
    },
    watchlistScores,
    themes,
  };
});

import { POST, GET } from "@/app/api/acp/stock-scan/route";

function makeReq(body: any = {}) {
  return new Request("http://localhost/api/acp/stock-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/acp/stock-scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the new slim shape with all markets", async () => {
    const res = await POST(makeReq({ market: "ALL" }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.picks.length).toBeGreaterThan(0);
    const apple = body.data.picks.find((p: any) => p.ticker === "AAPL");
    expect(apple).toMatchObject({
      ticker: "AAPL",
      momentum_score: 82,
      technical_score: 75,
      change_1w: 1.2,
    });
    expect(apple).not.toHaveProperty("fundamentals");
  });

  it("filters by market", async () => {
    const res = await POST(makeReq({ market: "SGX" }) as any);
    const body = await res.json();
    expect(body.data.picks.every((p: any) => p.market === "SGX")).toBe(true);
  });

  it("filters by min_momentum", async () => {
    const res = await POST(makeReq({ min_momentum: 70 }) as any);
    const body = await res.json();
    expect(body.data.picks.every((p: any) => p.momentum_score >= 70)).toBe(true);
  });

  it("ignores deprecated `enhanced` field", async () => {
    const res = await POST(makeReq({ enhanced: true }) as any);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/acp/stock-scan", () => {
  it("returns the new self-description", async () => {
    const res = await GET(new Request("http://localhost/api/acp/stock-scan") as any);
    const body = await res.json();
    expect(body.version).toBe("3.0");
    expect(body.params).toHaveProperty("min_momentum");
    expect(body.params).not.toHaveProperty("enhanced");
  });
});
