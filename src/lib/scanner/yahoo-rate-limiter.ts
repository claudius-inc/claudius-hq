/**
 * Global Yahoo Finance request governor.
 *
 * Two pieces:
 *
 * 1. `acquireYahooSlot()` — a single FIFO queue that paces every Yahoo call
 *    in this process. Default min-interval is ~200ms with ±25% jitter so a
 *    burst of `Promise.all` fan-outs gets serialized smoothly instead of
 *    hitting Yahoo all at once.
 *
 * 2. `withYahooRetry(label, fn)` — wraps a Yahoo call with exponential
 *    backoff for transient failures (HTTP 429, 5xx, network resets,
 *    timeouts). Honors `Retry-After` when present.
 *
 * Both are pure in-process and stateless across server restarts.
 */
import { logger } from "@/lib/logger";

// ── Rate limiter ─────────────────────────────────────────────────────────

const MIN_INTERVAL_MS = 200; // ~5 req/sec average ceiling
const JITTER_RATIO = 0.25; // ±25%

let nextSlotAt = 0;

function jitter(): number {
  return MIN_INTERVAL_MS * (1 + (Math.random() * 2 - 1) * JITTER_RATIO);
}

/**
 * Wait until the next available slot, then mark the slot consumed. Awaiting
 * callers are serialized FIFO by the JS event loop, so this also gives an
 * effective concurrency of 1 between any two `acquireYahooSlot()`s.
 */
export async function acquireYahooSlot(): Promise<void> {
  const now = Date.now();
  const wakeAt = Math.max(now, nextSlotAt);
  nextSlotAt = wakeAt + jitter();
  const wait = wakeAt - now;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/** Test-only: reset the internal cursor. */
export function __resetYahooSlot(): void {
  nextSlotAt = 0;
}

// ── Retry wrapper ────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 800;
const RETRY_JITTER_RATIO = 0.25;

interface RetryableError {
  status?: number;
  statusCode?: number;
  code?: string;
  message?: string;
  response?: { status?: number; headers?: Record<string, string | string[]> };
}

function getStatus(err: RetryableError): number | undefined {
  return err.status ?? err.statusCode ?? err.response?.status;
}

function getRetryAfterMs(err: RetryableError): number | null {
  const headers = err.response?.headers;
  if (!headers) return null;
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  // Numeric seconds or HTTP-date — handle both.
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function isTransient(err: unknown): boolean {
  const e = err as RetryableError;
  const status = getStatus(e);
  if (status !== undefined) {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false;
  }
  const code = e.code ?? "";
  if (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "ENOTFOUND" ||
    code === "ECONNABORTED"
  ) {
    return true;
  }
  const msg = String(e.message ?? "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("socket hang up")
  );
}

function backoffMs(attempt: number, err: unknown): number {
  const retryAfter = getRetryAfterMs(err as RetryableError);
  if (retryAfter !== null) return retryAfter;
  const base = BASE_BACKOFF_MS * 2 ** (attempt - 1); // 800, 1600, 3200, ...
  const jitterRange = base * RETRY_JITTER_RATIO;
  return base + (Math.random() * 2 - 1) * jitterRange;
}

/**
 * Run `fn`, retrying on transient errors with exponential backoff. The label
 * is used for log lines so failures are attributable.
 *
 * Re-throws the final error on permanent failures so callers can keep their
 * existing null-fallback semantics.
 */
export async function withYahooRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      const wait = backoffMs(attempt, err);
      logger.warn("yahoo-retry", `${label} retry ${attempt}/${MAX_ATTEMPTS - 1} in ${Math.round(wait)}ms`, {
        error: err,
      });
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  // Unreachable, but keeps TS happy.
  throw lastErr;
}
