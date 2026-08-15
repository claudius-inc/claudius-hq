/**
 * What regime is the perp book in right now, and in which context?
 *
 * Run with:
 *   npx tsx scripts/research/run-perp-regime.ts
 *   npx tsx scripts/research/run-perp-regime.ts --json
 *
 * The shortlist is ordered by a one-day reversal, which is a mean-reversion bet.
 * This prints the tape it is being applied to: direction over 7 and 30 days, how
 * DIRECTIONAL that move was against a random-walk null, and breadth by EMA
 * ribbon and quarterly VWAP — split by context, because the crypto book and the
 * tradfi book routinely point opposite ways.
 *
 * This is the same `summarizeRegime` the daily screen calls, so what prints here
 * is what the Telegram message will say. Reads the venue live and writes
 * nothing.
 */
import "dotenv/config";
import { VENUES, fetchBarsForAll } from "@/lib/markets/perp-venues";
import { CONVERGENCE_CONFIG, isNonTradable } from "@/lib/markets/convergence-screen";
import {
  summarizeRegime,
  groupOf,
  randomWalkEr,
  REGIME_CONFIG,
  type RegimeInput,
} from "@/lib/markets/perp-regime";

const JSON_OUT = process.argv.includes("--json");

/** Bars per request. The screen's own figure — 400 covers the 180-bar window. */
const BAR_LIMIT = CONVERGENCE_CONFIG.barLimit;

async function main() {
  const venue = VENUES.binance;
  const symbols = (await venue.listSymbols()).filter((s) => !isNonTradable(s.base));
  if (!JSON_OUT) console.log(`Universe: ${symbols.length} tradable perps. Fetching 4h bars...`);

  const barMap = await fetchBarsForAll(venue, symbols, CONVERGENCE_CONFIG.interval, BAR_LIMIT);

  const inputs: RegimeInput[] = [];
  let latestClose = 0;
  for (const sym of symbols) {
    const bars = barMap.get(sym.symbol);
    if (!bars || bars.length < REGIME_CONFIG.longBars + 1) continue;

    // The screen's own liquidity floor, so this describes the universe the
    // shortlist is actually drawn from and not the whole listing.
    const tail = bars.slice(-CONVERGENCE_CONFIG.liquidityBars);
    const avgQ =
      tail.reduce((a, b) => a + (Number.isFinite(b.q) ? b.q : 0), 0) / (tail.length || 1);
    if (avgQ < CONVERGENCE_CONFIG.minAvgQuoteVol) continue;

    inputs.push({ base: sym.base, category: sym.category, bars });
    latestClose = Math.max(latestClose, bars[bars.length - 1].tClose);
  }

  const summary = summarizeRegime(inputs, new Date(latestClose).toISOString());

  if (JSON_OUT) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`\nLiquid & scorable: ${inputs.length} names.  Last bar close: ${summary.asOf}\n`);

  const hdr =
    `  ${"context".padEnd(14)} ${"n".padStart(4)} ${"7d%".padStart(7)} ${"30d%".padStart(7)} ` +
    `${"ER30".padStart(6)} ${"xrw".padStart(5)} ${"ribUp".padStart(6)} ${"ribDn".padStart(6)} ` +
    `${">vwap".padStart(6)}  regime`;
  console.log(hdr);
  console.log(`  ${"-".repeat(hdr.length)}`);

  const row = (g: (typeof summary.groups)[number]) =>
    `  ${g.group.padEnd(14)} ${String(g.n).padStart(4)} ${g.ret7.toFixed(1).padStart(7)} ` +
    `${g.ret30.toFixed(1).padStart(7)} ${g.er30.toFixed(3).padStart(6)} ` +
    `${g.erMultiple.toFixed(2).padStart(5)} ${g.ribbonUpPct.toFixed(0).padStart(5)}% ` +
    `${g.ribbonDownPct.toFixed(0).padStart(5)}% ${g.aboveVwapPct.toFixed(0).padStart(5)}%  ${g.label}`;

  for (const g of summary.groups) console.log(row(g));
  console.log(`  ${"-".repeat(hdr.length)}`);
  console.log(row(summary.universe));

  // Groups too small for a median are hidden from the summary by design. Say so,
  // with their counts — "financials is one liquid name" is itself a finding
  // about the book, and silence would read as "financials is not listed".
  const counts = new Map<string, number>();
  for (const i of inputs) {
    const g = groupOf(i.base, i.category);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const shown = new Set(summary.groups.map((g) => g.group));
  const small = Array.from(counts.entries())
    .filter(([g]) => !shown.has(g))
    .sort((a, b) => b[1] - a[1]);
  if (small.length) {
    console.log(
      `\n  Below the ${REGIME_CONFIG.minGroupN}-name floor, so not summarised: ` +
        small.map(([g, n]) => `${g} (${n})`).join(", "),
    );
  }

  console.log(
    `\n  ER is net travel over gross travel across ${REGIME_CONFIG.longBars} bars. ` +
      `A random walk scores ${randomWalkEr(REGIME_CONFIG.longBars).toFixed(3)};\n` +
      `  "xrw" is the multiple of that, and ${REGIME_CONFIG.trendMultiple}x is where a group is ` +
      `called trending. Below 1.0x is choppier than a coin flip.\n` +
      `  ribUp/ribDn = share with the 8/21/34/55/89 EMA ribbon fully stacked or fully inverted.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
