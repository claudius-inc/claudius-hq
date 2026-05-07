#!/usr/bin/env tsx
import { takeMomentumSnapshot } from "@/lib/markets/momentum-gainers";

async function main() {
  const startedAt = Date.now();
  const result = await takeMomentumSnapshot();
  const elapsedMs = Date.now() - startedAt;

  console.log(
    JSON.stringify({
      event: "momentum_snapshot_complete",
      elapsed_ms: elapsedMs,
      ...result,
    }),
  );
}

main().catch((err) => {
  console.error("Momentum snapshot crashed:", err);
  process.exit(1);
});
