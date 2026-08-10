/**
 * Daily "Convergence" Telegram report — the single push that replaces both
 * "Crypto Movers" and "Momentum Gainers".
 *
 * Run with:
 *   npx tsx scripts/pipelines/run-convergence-report.ts
 *   npx tsx scripts/pipelines/run-convergence-report.ts --dry-run
 *
 * Selection lives in src/lib/markets/convergence-screen.ts. This script is the
 * orchestration + formatting shell: select -> record -> send.
 *
 * Picks are recorded BEFORE the send, so a Telegram outage cannot cost the
 * record. That ordering matters more here than it did for the reports this
 * replaces: the stored rows are the only evidence that will ever settle whether
 * the convergence ranking works, and the backtest says it currently does not.
 */
// FIRST import. The daily-trend lookup pulls in `@/db`, which builds its libsql
// client at module load, so the environment must be populated before any other
// import is evaluated. A no-op in CI, where the workflow injects the vars.
import "dotenv/config";
import {
  selectConvergencePicks,
  CONVERGENCE_CONFIG,
  type ConvergencePick,
  type ConvergenceResult,
} from "@/lib/markets/convergence-screen";
import { MAPPING_BY_SYMBOL } from "@/lib/markets/perp-underlying";
import {
  loadAdjustedSeries,
  computeDailyTrend,
  type TrendDirection,
} from "@/lib/markets/equity-history";
import { logger } from "@/lib/logger";

const TG = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;
const DRY_RUN = process.argv.includes("--dry-run");

async function send(text: string): Promise<boolean> {
  if (DRY_RUN) {
    console.log(text);
    return true;
  }
  if (!TG || !CHAT) {
    logger.warn("convergence-report", "Telegram credentials missing; skipping send");
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "Markdown" }),
  });
  if (!res.ok) {
    logger.error("convergence-report", "Telegram send failed", {
      status: res.status,
      body: (await res.text()).slice(0, 300),
    });
    return false;
  }
  return true;
}

// Strips the legacy-Markdown control characters Telegram would choke on.
// Backtick included: an unpaired one 400s the whole message.
const clean = (s: string) => String(s).replace(/[_*[\]`]/g, "").trim();

const pct = (v: number | null) =>
  v === null || v === undefined ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";

function fmtPrice(p: number | null): string {
  if (p === null || p === undefined) return "";
  if (p >= 1000) return "$" + Math.round(p).toLocaleString("en-US");
  if (p >= 1) return "$" + p.toFixed(2);
  if (p >= 0.01) return "$" + p.toFixed(4);
  return "$" + Number(p).toPrecision(2);
}

/** Compact category marker, so a tradfi name is distinguishable at a glance. */
const CATEGORY_TAG: Record<string, string> = {
  crypto: "",
  equity: "📊",
  premarket: "🚀",
  commodity: "🛢",
  index: "📉",
};

/** Which of the five factors fired, as initials — the report's whole substance. */
function factorInitials(p: ConvergencePick): string {
  const f = p.factors;
  const on: string[] = [];
  if (f.trend) on.push("T");
  if (f.pullback) on.push("P");
  if (f.support) on.push("S");
  if (f.proximity) on.push("X");
  if (f.vsa) on.push("V");
  return on.join("");
}

/**
 * Long-term daily trend agreement, from the UNDERLYING's own daily series.
 *
 * The 4h score cannot see past ~33 days, and its highest readings amount to
 * "closing near the 50-bar high" — the reading that most needs a longer-horizon
 * check. `✅` means the daily MA stack agrees with the side being proposed,
 * `⛔` means it points the other way, `〰️` means the stack is not cleanly
 * ordered. Blank means no long-term read exists for that name.
 */
function trendBadge(p: ConvergencePick, trends: Map<string, TrendDirection>): string {
  const d = trends.get(p.symbol);
  if (!d) return "";
  if (d === "mixed") return " 〰️";
  const agrees = (p.side === "long" && d === "up") || (p.side === "short" && d === "down");
  return agrees ? " ✅" : " ⛔";
}

function renderSide(
  picks: ConvergencePick[],
  heading: string,
  trends: Map<string, TrendDirection>,
): string[] {
  if (picks.length === 0) return [heading, "_none cleared the threshold_", ""];

  const lines = [heading];
  picks.forEach((p, i) => {
    const tag = CATEGORY_TAG[p.category] ?? "";
    const fresh = p.freshFlag ? " 🆕" : "";
    const contested = p.opposingScore >= 2 ? ` ⚠️${p.opposingScore}` : "";
    lines.push(
      `${i + 1}. \`${clean(p.base)}\`${tag ? " " + tag : ""} ` +
        `*${p.score}/${p.maxScore}*${fresh}${contested}${trendBadge(p, trends)} · ${fmtPrice(p.price)}`,
    );
    lines.push(
      `   \`${factorInitials(p).padEnd(5)}\` · RSI ${p.rsi === null ? "—" : Math.round(p.rsi)}` +
        ` · 5d ${pct(p.changePct)}`,
    );
  });
  lines.push("");
  return lines;
}

/**
 * Daily trend direction for every reported pick that has a verified underlying.
 *
 * Only reported names are looked up — a handful of queries, not one per
 * candidate. Names with no mapping (crypto, pre-IPO, unidentified) simply get
 * no badge rather than a fabricated neutral one.
 */
export async function loadTrends(
  picks: ConvergencePick[],
): Promise<Map<string, TrendDirection>> {
  const out = new Map<string, TrendDirection>();
  for (const p of picks) {
    const m = MAPPING_BY_SYMBOL.get(p.symbol);
    if (!m || m.status !== "verified" || !m.yahoo) continue;
    try {
      const { closes, currency } = await loadAdjustedSeries(m.yahoo);
      const trend = computeDailyTrend(m.yahoo, closes, currency);
      if (trend) out.set(p.symbol, trend.direction);
    } catch (err) {
      logger.warn("convergence-report", "Daily trend lookup failed", {
        symbol: p.symbol,
        error: err,
      });
    }
  }
  return out;
}

export function formatMessage(
  result: ConvergenceResult,
  trends: Map<string, TrendDirection> = new Map(),
): string {
  const { longs, shorts, funnel } = result;
  const asOf = result.asOf.replace("T", " ").slice(0, 16) + "Z";

  const lines = [
    "🎯 *Convergence — Binance Perps*",
    `_MCD factors agreeing, ${CONVERGENCE_CONFIG.interval} bars · as of ${asOf}_`,
    "",
  ];

  lines.push(...renderSide(longs, `📈 *LONG* (score ≥ ${CONVERGENCE_CONFIG.minScore})`, trends));
  lines.push(...renderSide(shorts, `📉 *SHORT* (score ≥ ${CONVERGENCE_CONFIG.minScore})`, trends));

  lines.push("_T=trend P=pullback S=support X=extreme V=volume · 🆕 new · ⚠️ contested_");
  lines.push("_Daily trend: ✅ agrees · ⛔ opposes · 〰️ unclear_");
  const cats = Object.entries(funnel.byCategory)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
  lines.push(
    `_${funnel.qualified} of ${funnel.liquid} liquid perps qualified` +
      (cats ? ` · ${cats}` : "") +
      `_`,
  );
  // The ranking is unvalidated and the message should not imply otherwise.
  lines.push("_⚠️ Ranking unvalidated — backtested IC is negative at 1-3d._");

  return lines.join("\n");
}

/**
 * Persists the run's candidates, flagging which ones were sent.
 *
 * Delete-then-insert in one batch so a same-day re-run is last-run-wins. An
 * upsert would merge two runs computed from different bars, leaving a stored
 * score that no longer follows from the stored price — corrupting exactly the
 * forward-return record the table exists to provide.
 */
async function recordPicks(result: ConvergenceResult, runDate: string): Promise<void> {
  // Imported here rather than at the top because `@/db` builds its libsql
  // client at module load and throws without TURSO_DATABASE_URL. A top-level
  // import would make `--dry-run` — the only way to eyeball the screen's output
  // without credentials — impossible to run locally.
  const { rawClient } = await import("@/db");

  const reported = new Set<string>();
  result.longs.forEach((p) => reported.add(`${p.symbol}|long`));
  result.shorts.forEach((p) => reported.add(`${p.symbol}|short`));

  // Rank is PER SIDE, over the full candidate list.
  //
  // It previously fell back to the index in `candidates`, which interleaves
  // longs and shorts — so the 9th-best long could be stored as rank 17 because
  // eight shorts outranked it, making `WHERE side='long' AND rank <= 8` wrong
  // and leaving rank discontinuous at the reported/un-reported boundary. That
  // is precisely the column the table exists to support a study on.
  const rankOf = new Map<ConvergencePick, number>();
  for (const side of ["long", "short"] as const) {
    result.candidates
      .filter((p) => p.side === side)
      .forEach((p, i) => rankOf.set(p, i + 1));
  }

  await rawClient.batch(
    [
      {
        sql: "DELETE FROM perp_convergence_picks WHERE run_date = ?",
        args: [runDate] as never[],
      },
      ...result.candidates.map((p, i) => ({
        sql: `INSERT INTO perp_convergence_picks
                (run_date, venue, symbol, base, category, side, rank, reported,
                 score, max_score, opposing_score, factors, fresh_flag,
                 contested, liquidity_pctl,
                 price, rsi, change_pct, avg_quote_vol, as_of)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          runDate, p.venue, p.symbol, p.base, p.category, p.side,
          rankOf.get(p) ?? i + 1,
          reported.has(`${p.symbol}|${p.side}`) ? 1 : 0,
          p.score, p.maxScore, p.opposingScore, JSON.stringify(p.factors),
          p.freshFlag ? 1 : 0,
          p.contested ? 1 : 0, p.liquidityPctl,
          p.price, p.rsi, p.changePct, p.avgQuoteVol, result.asOf,
        ] as never[],
      })),
    ],
    "write",
  );

  await rawClient.execute({
    sql: `INSERT INTO perp_convergence_runs
            (run_date, venue, interval, universe_n, with_bars_n, no_bars_n,
             too_short_n, stale_n, scorable_n, liquid_n, qualified_n,
             contested_n, long_n, short_n, as_of)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(run_date) DO UPDATE SET
            venue=excluded.venue, interval=excluded.interval,
            universe_n=excluded.universe_n, with_bars_n=excluded.with_bars_n,
            no_bars_n=excluded.no_bars_n, too_short_n=excluded.too_short_n,
            stale_n=excluded.stale_n,
            scorable_n=excluded.scorable_n, liquid_n=excluded.liquid_n,
            qualified_n=excluded.qualified_n, contested_n=excluded.contested_n,
            long_n=excluded.long_n, short_n=excluded.short_n,
            as_of=excluded.as_of`,
    args: [
      runDate, "binance", CONVERGENCE_CONFIG.interval,
      result.funnel.universe, result.funnel.withBars, result.funnel.noBars,
      result.funnel.tooShort, result.funnel.stale, result.funnel.scorable,
      result.funnel.liquid, result.funnel.qualified, result.funnel.contested,
      result.longs.length, result.shorts.length, result.asOf,
    ] as never[],
  });
}

async function main() {
  const runDate = new Date().toISOString().split("T")[0];
  const result = await selectConvergencePicks();

  // A universe collapse would otherwise read as "nothing converged today" — a
  // market observation, when it is really a data outage. Fail loudly.
  if (result.funnel.withBars < result.funnel.universe * 0.5) {
    throw new Error(
      `Only ${result.funnel.withBars} of ${result.funnel.universe} perps returned bars`,
    );
  }

  logger.info("convergence-report", "Screen complete", {
    runDate,
    ...result.funnel,
    longs: result.longs.length,
    shorts: result.shorts.length,
  });

  if (!DRY_RUN) await recordPicks(result, runDate);

  if (result.longs.length === 0 && result.shorts.length === 0) {
    const f = result.funnel;
    const ok = await send(
      "🎯 *Convergence — Binance Perps*\n\nNo setups cleared the threshold today.\n\n" +
        `_Universe ${f.universe} · scorable ${f.scorable} · liquid ${f.liquid}_`,
    );
    if (!ok) process.exitCode = 1;
    return;
  }

  const trends = await loadTrends([...result.longs, ...result.shorts]);
  const ok = await send(formatMessage(result, trends));
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  logger.error("convergence-report", "Report crashed", { error: err });
  process.exit(1);
});
