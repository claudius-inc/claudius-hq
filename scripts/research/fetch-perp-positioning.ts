/**
 * Fetches historical funding / open-interest / taker series for every perp.
 *
 * Run with:
 *   npx tsx scripts/research/fetch-perp-positioning.ts
 *   npx tsx scripts/research/fetch-perp-positioning.ts --limit 20   (smoke test)
 *
 * Writes `tmp/perp-backtest/positioning.json`, which the signal panel joins onto
 * bars. Takes ~15-25 minutes for the full 678-symbol universe: three requests
 * per symbol at concurrency 4, with backoff on the venue's rate limits.
 *
 * All the reasoning about what the venue will and will not serve lives in
 * `src/lib/markets/perp-positioning-history.ts`. The one thing worth repeating
 * here is the reason this script prints a coverage summary rather than just
 * exiting 0: open interest and taker flow are capped at 30 days by the venue,
 * so a successful run still produces a dataset that cannot support conclusions
 * about those signals. The summary is what makes that visible at the point the
 * data is created, instead of being rediscovered as a puzzling result later.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { binanceVenue } from "@/lib/markets/perp-venues";
import {
  fetchPositioningHistoryForAll,
  type PositioningHistory,
} from "@/lib/markets/perp-positioning-history";

const OUT_DIR = join(process.cwd(), "tmp", "perp-backtest");
const OUT_FILE = join(OUT_DIR, "positioning.json");

const argOf = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

const DAYS = (ms: number) => ms / 86_400_000;

async function main() {
  const limitArg = argOf("--limit");

  console.log("Listing Binance perp universe...");
  let symbols = (await binanceVenue.listSymbols()).map((s) => s.symbol);
  if (limitArg) symbols = symbols.slice(0, Number(limitArg));
  console.log(`  ${symbols.length} symbols`);

  const started = Date.now();
  console.log("Fetching funding (paged) + open interest (30d) + taker (30d)...");

  const history = await fetchPositioningHistoryForAll(symbols, {
    concurrency: 4,
    onProgress: (done) => {
      if (done % 50 === 0 || done === symbols.length) {
        const rate = done / ((Date.now() - started) / 1000);
        const eta = Math.round((symbols.length - done) / Math.max(rate, 0.001));
        console.log(`  ...${done}/${symbols.length}  (~${eta}s remaining)`);
      }
    },
  });

  const rows = Array.from(history.values());
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_FILE,
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      symbols: symbols.length,
      history: Object.fromEntries(history),
    }),
  );

  // ---- coverage summary: the point of the script, not decoration ----
  const span = (xs: { t: number }[]) =>
    xs.length > 1 ? DAYS(xs[xs.length - 1].t - xs[0].t) : 0;

  const med = (xs: number[]) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const withFunding = rows.filter((r) => r.funding.length > 0);
  const withOi = rows.filter((r) => r.oi.length > 0);
  const withTaker = rows.filter((r) => r.taker.length > 0);

  const intervals = new Map<number, number>();
  for (const r of rows) {
    if (r.fundingIntervalMs === null) continue;
    const h = r.fundingIntervalMs / 3_600_000;
    intervals.set(h, (intervals.get(h) ?? 0) + 1);
  }

  console.log(`\nWrote ${OUT_FILE}`);
  console.log(`${"series".padEnd(10)} ${"symbols".padStart(8)} ${"median span (days)".padStart(19)}`);
  console.log(`${"-".repeat(10)} ${"-".repeat(8)} ${"-".repeat(19)}`);
  console.log(
    `${"funding".padEnd(10)} ${String(withFunding.length).padStart(8)} ` +
      `${med(withFunding.map((r) => span(r.funding))).toFixed(1).padStart(19)}`,
  );
  console.log(
    `${"oi".padEnd(10)} ${String(withOi.length).padStart(8)} ` +
      `${med(withOi.map((r) => span(r.oi))).toFixed(1).padStart(19)}`,
  );
  console.log(
    `${"taker".padEnd(10)} ${String(withTaker.length).padStart(8)} ` +
      `${med(withTaker.map((r) => span(r.taker))).toFixed(1).padStart(19)}`,
  );

  console.log(
    `\nFunding settlement intervals: ` +
      Array.from(intervals.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([h, n]) => `${h}h x${n}`)
        .join(", "),
  );

  console.log(
    "\nNOTE: open interest and taker flow are capped at ~30 days BY THE VENUE.\n" +
      "At a 7-day horizon that is roughly 4 non-overlapping observations, which\n" +
      "cannot support a conclusion — including about the |OI change| ordering the\n" +
      "live report currently uses. Funding is the only deep positioning series.",
  );
}

main().catch((err) => {
  console.error("Positioning fetch failed:", err);
  process.exit(1);
});
