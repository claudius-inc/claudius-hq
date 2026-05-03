import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("@/lib/scanner/watchlist-orchestrator", () => ({
  computeWatchlistScores: vi.fn(async () => ({
    tickersProcessed: 5,
    okCount: 4,
    partialCount: 1,
    failedCount: 0,
    allFailed: false,
  })),
}));

import { POST } from "@/app/api/markets/scanner/watchlist/refresh/route";

const ORIG_KEY = process.env.HQ_API_KEY;

beforeEach(() => {
  process.env.HQ_API_KEY = "test-secret";
});

afterAll(() => {
  process.env.HQ_API_KEY = ORIG_KEY;
});

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/markets/scanner/watchlist/refresh", {
    method: "POST",
    headers,
  });
}

describe("POST /api/markets/scanner/watchlist/refresh", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it("rejects wrong bearer", async () => {
    const res = await POST(makeReq({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("runs the scanner and returns the summary on success", async () => {
    const res = await POST(makeReq({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      tickersProcessed: 5,
      okCount: 4,
      failedCount: 0,
    });
  });

  it("returns 503 when allFailed is true", async () => {
    const mod = await import("@/lib/scanner/watchlist-orchestrator");
    vi.mocked(mod.computeWatchlistScores).mockResolvedValueOnce({
      tickersProcessed: 5,
      okCount: 0,
      partialCount: 0,
      failedCount: 5,
      allFailed: true,
    });
    const res = await POST(makeReq({ authorization: "Bearer test-secret" }));
    expect(res.status).toBe(503);
  });
});
