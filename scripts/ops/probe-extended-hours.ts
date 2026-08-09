/**
 * One-off probe: extended-hours field behaviour during a LIVE post-market session.
 *
 *   npx tsx -r dotenv/config scripts/ops/probe-extended-hours.ts
 *   (set DOTENV_CONFIG_PATH=.env)
 *
 * Run it on a trading evening between 4:15pm and 8:00pm ET. Weekend probes only
 * show frozen end-of-session values, so they cannot answer the questions that
 * gate docs/daily-note-v2-spec.md §G:
 *
 *   1. Is `marketState` actually "POST" mid-session?
 *   2. Are postMarketPrice / postMarketChangePercent / postMarketTime populated
 *      and moving, or stale?
 *   3. Do the unified `extendedMarket*` fields carry anything? (They came back
 *      undefined on a weekend probe.)
 *   4. Is postMarketChangePercent really in percent units, not a fraction?
 *   5. Does an index stay false on hasPrePostMarketData while live?
 *
 * Delete this file once §G ships — it answers a question only once.
 */
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// A spread: mega-cap, liquid mid-cap, an ETF, and an index (expected: no extended data).
const SYMBOLS = ["AAPL", "NVDA", "AKAM", "SPY", "XLE", "^GSPC"];

const etNow = () =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date());

const etTime = (d: unknown) => {
  if (!d) return "—";
  const ms = d instanceof Date ? d.getTime() : typeof d === "number" ? (d > 1e12 ? d : d * 1000) : Date.parse(String(d));
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(ms));
};

async function main() {
  console.log(`Probe run at ${etNow()} ET\n`);

  for (const symbol of SYMBOLS) {
    const q = (await yahooFinance.quote(symbol)) as Record<string, unknown>;
    const pct = q.postMarketChangePercent as number | undefined;
    console.log(`${symbol}`);
    console.log(`  marketState          : ${q.marketState}`);
    console.log(`  hasPrePostMarketData : ${q.hasPrePostMarketData}`);
    console.log(`  regularMarketPrice   : ${q.regularMarketPrice}  (close time ${etTime(q.regularMarketTime)})`);
    console.log(`  postMarketPrice      : ${q.postMarketPrice ?? "—"}`);
    console.log(`  postMarketChangePct  : ${pct ?? "—"}`);
    console.log(`  postMarketTime       : ${etTime(q.postMarketTime)}`);
    console.log(`  extendedMarketPrice  : ${q.extendedMarketPrice ?? "—"}`);
    console.log(`  extendedMarketChange%: ${q.extendedMarketChangePercent ?? "—"}`);

    // Units check: recompute the percent from the two prices and compare. If the
    // API value matches the recomputed one, it is percent; if it is ~100x
    // smaller, it is a fraction and the §G 2% gate would pass everything.
    const close = q.regularMarketPrice as number | undefined;
    const post = q.postMarketPrice as number | undefined;
    if (close && post && pct != null) {
      const recomputed = ((post - close) / close) * 100;
      const verdict = Math.abs(recomputed - pct) < Math.abs(recomputed) * 0.1 ? "PERCENT" : "NOT percent — check";
      console.log(`  units                : recomputed ${recomputed.toFixed(4)} vs api ${pct} → ${verdict}`);
    }
    console.log();
  }

  console.log("Re-run in ~15 minutes. If postMarketTime advances, the session is live and §G can trust it.");
}

main().catch((err) => {
  console.error("Probe failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
