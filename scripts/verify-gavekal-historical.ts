/**
 * Verify the historical Gavekal regime pipeline.
 * Loads monthly data, builds the regime change list, and prints summary stats
 * + a few representative segments. Use to spot-check the seed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  // Dynamic import so env vars load before src/db/index.ts initialises
  const { loadHistoricalRegimeHistory } = await import(
    "../src/lib/gavekal-historical"
  );
  console.log("Loading historical regime history…\n");
  const points = await loadHistoricalRegimeHistory();
  if (points.length === 0) {
    console.log("EMPTY result — historical tables likely missing");
    process.exit(1);
  }

  console.log(`Total regime change points: ${points.length}`);
  console.log(`Span: ${points[0].date} → ${points[points.length - 1].date}`);

  // Quadrant frequency
  const freq: Record<string, number> = {};
  for (let i = 0; i < points.length - 1; i++) {
    const startMs = new Date(points[i].date).getTime();
    const endMs = new Date(points[i + 1].date).getTime();
    const months = (endMs - startMs) / (1000 * 60 * 60 * 24 * 30.4);
    freq[points[i].quadrant] = (freq[points[i].quadrant] ?? 0) + months;
  }
  // Last segment to today
  const last = points[points.length - 1];
  const lastMonths =
    (Date.now() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24 * 30.4);
  freq[last.quadrant] = (freq[last.quadrant] ?? 0) + lastMonths;

  const totalMonths = Object.values(freq).reduce((a, b) => a + b, 0);
  console.log(`\nApprox total span: ${(totalMonths / 12).toFixed(1)} years`);
  console.log(`\nQuadrant time-in-state (years, % of total):`);
  for (const [name, months] of Object.entries(freq).sort(
    (a, b) => b[1] - a[1],
  )) {
    const yrs = (months / 12).toFixed(1);
    const pct = ((months / totalMonths) * 100).toFixed(1);
    console.log(`  ${name.padEnd(20)} ${yrs.padStart(6)}y  (${pct}%)`);
  }

  // First 5 + last 5 transitions
  console.log("\nFirst 5 regime changes:");
  for (const p of points.slice(0, 5)) {
    console.log(`  ${p.date}  →  ${p.quadrant}`);
  }
  console.log("\nLast 5 regime changes:");
  for (const p of points.slice(-5)) {
    console.log(`  ${p.date}  →  ${p.quadrant}`);
  }

  // Spot-check known historical eras
  const findRegimeAt = (target: string): string | null => {
    let current: string | null = null;
    for (const p of points) {
      if (p.date > target) break;
      current = p.quadrant;
    }
    return current;
  };

  console.log("\nSpot checks at notable dates:");
  const checks = [
    ["1936-01-01", "Mid Great Depression recovery"],
    ["1944-06-01", "WWII / Bretton Woods"],
    ["1973-12-01", "Oil crisis / stagflation"],
    ["1980-06-01", "Volcker disinflation"],
    ["1999-12-01", "Dot-com peak"],
    ["2008-12-01", "GFC trough"],
    ["2020-06-01", "COVID rebound"],
    ["2022-06-01", "Inflation spike"],
  ];
  for (const [date, label] of checks) {
    console.log(`  ${date}  ${findRegimeAt(date) ?? "n/a"}  — ${label}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
