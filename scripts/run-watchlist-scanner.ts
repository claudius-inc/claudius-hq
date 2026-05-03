#!/usr/bin/env tsx
/**
 * Entry point for the watchlist scanner GitHub Action.
 * Calls computeWatchlistScores() and exits with the appropriate code.
 *
 * Env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
 */
import { computeWatchlistScores } from "@/lib/scanner/watchlist-orchestrator";

async function main() {
  const startedAt = Date.now();
  const result = await computeWatchlistScores();
  const elapsedMs = Date.now() - startedAt;

  console.log(JSON.stringify({
    event: "watchlist_run_complete",
    elapsed_ms: elapsedMs,
    ...result,
  }));

  if (result.allFailed) {
    console.error("All ticker fetches failed; exiting 1.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Watchlist scanner crashed:", err);
  process.exit(1);
});
