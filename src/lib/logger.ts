/* ── Structured logger for Vercel ──────────────────────────────────────
 * Outputs one JSON line per call. Vercel parses these natively, making
 * them searchable and filterable in the dashboard.
 * ------------------------------------------------------------------- */

type Level = "debug" | "info" | "warn" | "error";

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const out: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    const code = (err as { code?: unknown }).code;
    if (code !== undefined) out.code = code;
    if (err.cause !== undefined) {
      out.cause =
        err.cause instanceof Error
          ? {
              name: err.cause.name,
              message: err.cause.message,
              stack: err.cause.stack,
            }
          : String(err.cause);
    }
    return out;
  }
  return { message: String(err) };
}

function log(level: Level, source: string, message: string, meta?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
  };

  if (meta) {
    const { error, ...rest } = meta;
    if (error !== undefined) {
      entry.error = serializeError(error);
    }
    if (Object.keys(rest).length > 0) {
      Object.assign(entry, rest);
    }
  }

  // Use matching console method so Vercel severity tagging works
  const fn =
    level === "error" ? console.error :
    level === "warn" ? console.warn :
    level === "debug" ? console.debug :
    console.log;

  fn(JSON.stringify(entry));
}

export const logger = {
  debug: (source: string, message: string, meta?: Record<string, unknown>) => log("debug", source, message, meta),
  info:  (source: string, message: string, meta?: Record<string, unknown>) => log("info", source, message, meta),
  warn:  (source: string, message: string, meta?: Record<string, unknown>) => log("warn", source, message, meta),
  error: (source: string, message: string, meta?: Record<string, unknown>) => log("error", source, message, meta),
};
