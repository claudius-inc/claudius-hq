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
  fetchPositioningForAll,
  type Positioning,
} from "@/lib/markets/perp-positioning";
import {
  HEADER,
  SHORTLIST_BUTTON,
  fmtAsOf,
  footer,
  renderSide,
  type MessageRow,
} from "@/lib/markets/convergence-message";
import {
  loadAdjustedSeries,
  computeDailyTrend,
  type TrendDirection,
} from "@/lib/markets/equity-history";
import { logger } from "@/lib/logger";

const TG = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;
const DRY_RUN = process.argv.includes("--dry-run");
/** Runs and PERSISTS the screen without sending anything. Used to populate the
 *  page's data without pushing a message nobody asked for. */
const RECORD_ONLY = process.argv.includes("--record-only");

async function send(text: string): Promise<boolean> {
  if (DRY_RUN || RECORD_ONLY) {
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
    body: JSON.stringify({
      chat_id: CHAT,
      text,
      parse_mode: "Markdown",
      reply_markup: SHORTLIST_BUTTON,
    }),
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

/**
 * A pick, as the shared renderer sees it.
 *
 * Open interest comes from the positioning snapshot rather than the pick, which
 * is why this mapping needs both. Everything the old three-line layout carried
 * beyond this — factor initials, RSI, qVWAP, the 5-day change, funding basis
 * points, the taker ratio — is on the page the message now links to. It did not
 * survive the width budget, and on a phone it was arriving as wrapped fragments
 * nobody read.
 */
function toMessageRow(
  p: ConvergencePick,
  trends: Map<string, TrendDirection>,
  pos: Map<string, Positioning>,
): MessageRow {
  return {
    base: p.base,
    category: p.category,
    score: p.score,
    maxScore: p.maxScore,
    price: p.price,
    rev6: p.rev6,
    oiChangePct: pos.get(p.symbol)?.oiChangePct ?? null,
    volPctl: p.volPctl,
    comboGated: p.comboGated,
    freshFlag: p.freshFlag,
    contested: p.opposingScore >= 2,
    trend: trends.get(p.symbol) ?? null,
    side: p.side,
  };
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
  pos: Map<string, Positioning> = new Map(),
): string {
  const { longs, shorts, funnel } = result;
  const map = (picks: ConvergencePick[]) => picks.map((p) => toMessageRow(p, trends, pos));
  const longRows = map(longs);
  const shortRows = map(shorts);

  const lines = [
    HEADER,
    `_${CONVERGENCE_CONFIG.interval} bars · ${fmtAsOf(result.asOf)}_`,
    "",
    ...renderSide(longRows, "📈 *LONG*"),
    ...renderSide(shortRows, "📉 *SHORT*"),
    ...footer([...longRows, ...shortRows]),
  ];

  // The funnel counts belong to this script only — the CI sender reads picks,
  // not runs, so it has no funnel to report. They stay last: they say how hard
  // the screen worked, which is worth knowing occasionally and never worth
  // reading before the list.
  const cats = Object.entries(funnel.byCategory)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
  lines.push(
    `_${funnel.qualified} of ${funnel.liquid} liquid perps qualified` + (cats ? ` · ${cats}` : "") + `_`,
  );
  lines.push(
    `_Held back: ${funnel.cooldownSkipped} on cooldown · ` +
      `${funnel.correlationSkipped} too correlated · ${funnel.contested} contested · ` +
      `${funnel.trendShortSkipped} shorts still rising_`,
  );

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
                 price, rsi, change_pct, avg_quote_vol, as_of,
                 vol_pctl, vwap_dist_pct, qvwap, oi_change_pct, oi_pctl,
                 rvol, rev6, funding_abs, combo_score, combo_gated,
                 vol_surge, range_expansion)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          runDate, p.venue, p.symbol, p.base, p.category, p.side,
          rankOf.get(p) ?? i + 1,
          reported.has(`${p.symbol}|${p.side}`) ? 1 : 0,
          p.score, p.maxScore, p.opposingScore, JSON.stringify(p.factors),
          p.freshFlag ? 1 : 0,
          p.contested ? 1 : 0, p.liquidityPctl,
          p.price, p.rsi, p.changePct, p.avgQuoteVol, result.asOf,
          // Everything below is computed during the screen and would otherwise
          // be lost — the page cannot recompute it without calling the venue.
          p.volPctl, p.vwapDistPct, p.qvwap, p.oiChangePct, p.oiPctl,
          p.rvol, p.rev6, p.fundingAbs, p.comboScore, p.comboGated ? 1 : 0,
          p.volSurge, p.rangeExpansion,
        ] as never[],
      })),
    ],
    "write",
  );

  await rawClient.execute({
    sql: `INSERT INTO perp_convergence_runs
            (run_date, venue, interval, universe_n, with_bars_n, no_bars_n,
             too_short_n, stale_n, scorable_n, liquid_n, qualified_n,
             contested_n, long_n, short_n, as_of, regime)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(run_date) DO UPDATE SET
            venue=excluded.venue, interval=excluded.interval,
            universe_n=excluded.universe_n, with_bars_n=excluded.with_bars_n,
            no_bars_n=excluded.no_bars_n, too_short_n=excluded.too_short_n,
            stale_n=excluded.stale_n,
            scorable_n=excluded.scorable_n, liquid_n=excluded.liquid_n,
            qualified_n=excluded.qualified_n, contested_n=excluded.contested_n,
            long_n=excluded.long_n, short_n=excluded.short_n,
            as_of=excluded.as_of, regime=excluded.regime`,
    args: [
      runDate, "binance", CONVERGENCE_CONFIG.interval,
      result.funnel.universe, result.funnel.withBars, result.funnel.noBars,
      result.funnel.tooShort, result.funnel.stale, result.funnel.scorable,
      result.funnel.liquid, result.funnel.qualified, result.funnel.contested,
      result.longs.length, result.shorts.length, result.asOf,
      // JSON rather than columns: the group list is variable-length and the
      // sender only ever renders it whole. Null when the read failed, so the
      // message drops the block instead of printing an empty one.
      result.regime ? JSON.stringify(result.regime) : null,
    ] as never[],
  });
}

/**
 * Symbols reported within the cooldown window.
 *
 * Read from the picks table rather than tracked in memory so the suppression
 * survives restarts and applies across runs. Only `reported = 1` rows count:
 * a name that merely qualified yesterday was never shown to anyone, so it is
 * still new information today.
 */
async function recentlyReportedSymbols(cooldownDays: number): Promise<Set<string>> {
  const { rawClient } = await import("@/db");
  const rows = await rawClient.execute({
    sql: `SELECT DISTINCT symbol FROM perp_convergence_picks
          WHERE reported = 1 AND run_date >= date('now', ?)`,
    args: [`-${cooldownDays} day`] as never[],
  });
  return new Set(rows.rows.map((r) => String(r.symbol)));
}

/** 4h bars stored per shortlisted name — ~30 days, enough to read structure. */
const CHART_BARS = 180;

/**
 * Writes the candles behind each reported pick.
 *
 * Delete-then-insert per run so a same-day re-run replaces rather than merges:
 * bars and picks must describe the same moment, or the chart shows one run's
 * price action under another run's score.
 */
async function recordChartBars(picks: ConvergencePick[], runDate: string): Promise<void> {
  const { rawClient } = await import("@/db");
  const { binanceVenue } = await import("@/lib/markets/perp-venues");
  const { quarterlyVwap } = await import("@/lib/markets/convergence-screen");

  const stmts: { sql: string; args: never[] }[] = [
    { sql: "DELETE FROM perp_chart_bars WHERE run_date = ?", args: [runDate] as never[] },
  ];

  for (const p of picks) {
    try {
      const bars = await binanceVenue.fetchBars(p.symbol, "4h", CHART_BARS + 1);
      if (!bars.length) continue;
      stmts.push({
        sql: `INSERT INTO perp_chart_bars (run_date, symbol, interval, bars, qvwap)
              VALUES (?,?,?,?,?)`,
        args: [
          runDate,
          p.symbol,
          "4h",
          JSON.stringify(bars.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v])),
          quarterlyVwap(bars),
        ] as never[],
      });
    } catch (err) {
      // One unavailable symbol costs its chart, not the whole write.
      logger.warn("convergence-report", "Chart bars unavailable", {
        symbol: p.symbol,
        error: err,
      });
    }
  }

  await rawClient.batch(stmts, "write");
  logger.info("convergence-report", "Chart bars recorded", {
    runDate,
    symbols: stmts.length - 1,
  });
}

async function main() {
  const runDate = new Date().toISOString().split("T")[0];

  // In dry-run the DB may be unreachable; an empty cooldown set is the right
  // fallback, since suppressing nothing is safer than failing the preview.
  let recent = new Set<string>();
  try {
    recent = await recentlyReportedSymbols(CONVERGENCE_CONFIG.cooldownDays);
  } catch (err) {
    logger.warn("convergence-report", "Cooldown lookup failed; no suppression applied", {
      error: err,
    });
  }

  const result = await selectConvergencePicks("binance", CONVERGENCE_CONFIG, recent);

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

  const reported = [...result.longs, ...result.shorts];

  // Persist the candles for the reported names. The web app cannot fetch them
  // itself: Binance returns 451 to US-hosted serverless runtimes, so a page
  // that called the venue at render time would work locally and fail in
  // production. This job already runs from a permitted region, so it writes
  // what the page needs and the page reads only the database.
  if (!DRY_RUN) await recordChartBars(reported, runDate);

  const trends = await loadTrends(reported);
  // Positioning is fetched for the REPORTED names only — three requests each,
  // so running it over all 136 qualifiers would be 400+ calls for data that
  // only annotates the 16 that get sent.
  const positioning = await fetchPositioningForAll(reported.map((p) => p.symbol));

  const ok = await send(formatMessage(result, trends, positioning));
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  logger.error("convergence-report", "Report crashed", { error: err });
  process.exit(1);
});
