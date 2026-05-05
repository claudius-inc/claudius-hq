import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  acquireYahooSlot,
  withYahooRetry,
  __resetYahooSlot,
} from "@/lib/scanner/yahoo-rate-limiter";

describe("acquireYahooSlot", () => {
  beforeEach(() => {
    __resetYahooSlot();
  });

  it("paces sequential calls — second resolves after first plus the min interval", async () => {
    const t0 = Date.now();
    await acquireYahooSlot();
    await acquireYahooSlot();
    const elapsed = Date.now() - t0;
    // Min interval is 200ms with ±25% jitter, so a single gap is at least
    // 150ms in the worst case.
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });

  it("first call resolves immediately when no prior call has been made", async () => {
    const t0 = Date.now();
    await acquireYahooSlot();
    expect(Date.now() - t0).toBeLessThan(50);
  });
});

describe("withYahooRetry", () => {
  it("retries on a 429 and succeeds on the next attempt", async () => {
    let calls = 0;
    const result = await withYahooRetry("test", async () => {
      calls++;
      if (calls < 2) {
        const err = Object.assign(new Error("rate limited"), { status: 429 });
        throw err;
      }
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  }, 10000);

  it("does not retry on permanent failures (e.g., 404)", async () => {
    let calls = 0;
    await expect(
      withYahooRetry("test", async () => {
        calls++;
        const err = Object.assign(new Error("not found"), { status: 404 });
        throw err;
      }),
    ).rejects.toThrow(/not found/);
    expect(calls).toBe(1);
  });

  it("gives up after MAX_ATTEMPTS=3 transient failures", async () => {
    let calls = 0;
    await expect(
      withYahooRetry("test", async () => {
        calls++;
        const err = Object.assign(new Error("server error"), { status: 503 });
        throw err;
      }),
    ).rejects.toThrow(/server error/);
    expect(calls).toBe(3);
  }, 15000);

  it("honors Retry-After (numeric seconds) when present", async () => {
    let calls = 0;
    const t0 = Date.now();
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    await withYahooRetry("test", async () => {
      calls++;
      if (calls < 2) {
        const err = Object.assign(new Error("rate limited"), {
          status: 429,
          response: { status: 429, headers: { "retry-after": "1" } },
        });
        throw err;
      }
      return "ok";
    });
    // The retry's setTimeout should have been called with ~1000ms (Retry-After
    // header takes precedence over exponential backoff).
    const retrySleep = setTimeoutSpy.mock.calls
      .map((c) => c[1] as number)
      .find((d) => typeof d === "number" && d >= 900 && d <= 1100);
    expect(retrySleep).toBeDefined();
    expect(calls).toBe(2);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    setTimeoutSpy.mockRestore();
  }, 10000);
});
