import { describe, it, expect, vi, beforeEach } from "vitest";

// Metrics rows now carry only volatile/computed columns; name/market/description
// are sourced from scanner_universe via JOIN, themeIds from theme_stocks.
const fakeMetrics = [
  { ticker: "AAPL",  price: 180, momentumScore: 82, technicalScore: 75, priceChange1d: 0.3, priceChange1w: 1.2,  priceChange1m: 4.5, priceChange3m: 8.0, dataQuality: "ok", computedAt: "2026-05-03T12:00:00Z" },
  { ticker: "D05.SI", price: 35,  momentumScore: 40, technicalScore: 50, priceChange1d: 0.0, priceChange1w: -0.5, priceChange1m: 1.0, priceChange3m: 2.0, dataQuality: "ok", computedAt: "2026-05-03T12:00:00Z" },
];
const fakeThemes = [{ id: 1, name: "AI" }, { id: 2, name: "SG Banks" }];
const fakeUniverse = [
  { ticker: "AAPL", name: "Apple", market: "US", notes: "Consumer electronics" },
  { ticker: "D05.SI", name: "DBS", market: "SGX", notes: "SG bank" },
];
const fakeThemeStocks = [
  { ticker: "AAPL", themeId: 1 },
  { ticker: "D05.SI", themeId: 2 },
];

vi.mock("@/db", () => {
  const tickerMetrics = { ticker: "ticker", momentumScore: "momentum_score" };
  const themes = { id: "id", name: "name" };
  const scannerUniverse = { ticker: "ticker", name: "name", market: "market", notes: "notes" };
  const themeStocks = { ticker: "ticker", themeId: "themeId" };

  // Per-test call sequence: tickerMetrics .from().orderBy(), then themes .from(),
  // then scannerUniverse .from(), then themeStocks .from().
  let callIndex = 0;
  return {
    db: {
      select: vi.fn(() => {
        callIndex++;
        const which = ((callIndex - 1) % 4) + 1;
        if (which === 1) {
          return {
            from: vi.fn(() => ({
              orderBy: vi.fn(async () => fakeMetrics),
            })),
          };
        } else if (which === 2) {
          return { from: vi.fn(async () => fakeThemes) };
        } else if (which === 3) {
          return { from: vi.fn(async () => fakeUniverse) };
        } else {
          return { from: vi.fn(async () => fakeThemeStocks) };
        }
      }),
    },
    tickerMetrics,
    themes,
    scannerUniverse,
    themeStocks,
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
      name: "Apple",
      market: "US",
      momentum_score: 82,
      technical_score: 75,
      change_1w: 1.2,
      description: "Consumer electronics",
    });
    expect(apple.themes).toEqual(["AI"]);
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
  it("returns the self-description", async () => {
    const res = await GET(new Request("http://localhost/api/acp/stock-scan") as any);
    const body = await res.json();
    expect(body.version).toBeTruthy();
    expect(body.params).toHaveProperty("min_momentum");
    expect(body.params).not.toHaveProperty("enhanced");
  });
});
