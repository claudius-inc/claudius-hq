export function rateLimit(options: {
  interval: number;
  uniqueTokenPerInterval: number;
}) {
  const tokenCache = new Map<string, number[]>();

  // Cleanup old entries every interval
  const cleanup = setInterval(() => {
    const now = Date.now();
    tokenCache.forEach((timestamps, key) => {
      const valid = timestamps.filter((t: number) => now - t < options.interval);
      if (valid.length === 0) tokenCache.delete(key);
      else tokenCache.set(key, valid);
    });
  }, options.interval);

  // Allow garbage collection in non-server contexts
  if (typeof cleanup === "object" && "unref" in cleanup) {
    (cleanup as NodeJS.Timeout).unref();
  }

  return {
    check: (limit: number, token: string) => {
      const now = Date.now();
      const timestamps = tokenCache.get(token) || [];
      const valid = timestamps.filter((t) => now - t < options.interval);
      if (valid.length >= limit) {
        return { success: false, remaining: 0 };
      }
      valid.push(now);
      tokenCache.set(token, valid);
      return { success: true, remaining: limit - valid.length };
    },
  };
}
