/**
 * Sends the daily shortlist to Telegram, reading only the database.
 *
 * Run with:
 *   npx tsx scripts/pipelines/send-shortlist-telegram.ts
 *   npx tsx scripts/pipelines/send-shortlist-telegram.ts --dry-run
 *
 * WHY THIS IS SEPARATE FROM THE SCREEN
 * ------------------------------------
 * The screen must run from a Binance-permitted region, because the venue
 * answers HTTP 451 to datacenter IP ranges. Sending a message has no such
 * constraint — it needs network access and rows that already exist. Keeping the
 * two apart means the bot token never has to live on the fetch VPS, where it
 * would be a credential held for no capability that host uniquely provides.
 *
 * So: the VPS writes, GitHub Actions sends. Neither needs the other's secrets.
 *
 * STALENESS IS THE FAILURE MODE THAT MATTERS
 * ------------------------------------------
 * These two jobs are decoupled, which means this one still runs when the fetch
 * did not. Reading "the latest picks" and sending them would then publish
 * yesterday's shortlist under today's date — the worst kind of failure, because
 * it looks exactly like success. The run date is checked against today and a
 * stale result becomes an ALERT rather than a report.
 */
import "dotenv/config";
import { rawClient } from "@/db";
import { logger } from "@/lib/logger";
import {
  HEADER,
  SHORTLIST_BUTTON,
  fmtAsOf,
  footer,
  renderSide,
  type MessageRow,
} from "@/lib/markets/convergence-message";

const TG = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;
const DRY_RUN = process.argv.includes("--dry-run");

interface Row {
  base: string;
  side: string;
  category: string;
  score: number;
  max_score: number;
  price: number | null;
  vol_pctl: number | null;
  oi_change_pct: number | null;
  rev6: number | null;
  fresh_flag: number | null;
  opposing_score: number | null;
  combo_gated: number | null;
  run_date: string;
  as_of: string | null;
}

/** DB row to the shape the renderer takes. */
const toMessageRow = (r: Row): MessageRow => ({
  base: r.base,
  category: r.category,
  score: r.score,
  maxScore: r.max_score,
  price: r.price,
  rev6: r.rev6,
  oiChangePct: r.oi_change_pct,
  volPctl: r.vol_pctl,
  comboGated: r.combo_gated === 1,
  freshFlag: r.fresh_flag === 1,
  // NOT the `contested` column. That one records why a name was DROPPED, so on
  // a reported row it is always 0 and the flag could never fire — this sender
  // has been silently unable to show ⚠️ at all. The report script derives it
  // from the opposing score; read the same thing from the same rows.
  contested: (r.opposing_score ?? 0) >= 2,
});

async function send(text: string, withButton = false): Promise<boolean> {
  if (DRY_RUN) {
    console.log(text);
    return true;
  }
  if (!TG || !CHAT) {
    logger.warn("shortlist-telegram", "Telegram credentials missing; skipping send");
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT,
      text,
      parse_mode: "Markdown",
      // The message deliberately no longer carries RSI, qVWAP, the factor
      // initials or the volatility percentile — they did not fit the width and
      // they are all on the page. The button is what makes that a move rather
      // than a loss, so it ships with the list and not with the alerts.
      ...(withButton ? { reply_markup: SHORTLIST_BUTTON } : {}),
    }),
  });
  if (!res.ok) {
    logger.error("shortlist-telegram", "Telegram send failed", {
      status: res.status,
      body: (await res.text()).slice(0, 300),
    });
    return false;
  }
  return true;
}

async function main() {
  const res = await rawClient.execute(`
    SELECT base, side, category, score, max_score, price,
           vol_pctl, oi_change_pct, rev6, fresh_flag, opposing_score, combo_gated,
           run_date, as_of
    FROM perp_convergence_picks
    WHERE reported = 1
      AND run_date = (SELECT MAX(run_date) FROM perp_convergence_picks WHERE reported = 1)
    ORDER BY side DESC, rank ASC
  `);
  const rows = res.rows as unknown as Row[];

  if (!rows.length) {
    const ok = await send(
      "⚠️ *Shortlist unavailable*\n\nNo picks have ever been recorded. " +
        "The fetch job on the VPS has not completed a run.",
    );
    process.exitCode = ok ? 0 : 1;
    return;
  }

  // Freshness gate. The fetch runs on a different machine on its own schedule,
  // so this job can succeed while that one silently failed — and a stale list
  // sent under today's date is worse than no list at all.
  const today = new Date().toISOString().slice(0, 10);
  const runDate = rows[0].run_date;

  if (runDate !== today) {
    logger.error("shortlist-telegram", "Shortlist is stale", { runDate, today });
    const ok = await send(
      `⚠️ *Shortlist is stale*\n\nThe most recent run is \`${runDate}\`, not \`${today}\`.\n` +
        "The fetch job on the VPS has not produced today's shortlist — check " +
        "`fetch.log` there.\n\n_No picks sent, to avoid publishing a stale list as current._",
    );
    // Exit non-zero so the workflow surfaces this as a failure rather than a
    // green tick with a warning nobody reads.
    process.exitCode = ok ? 1 : 1;
    return;
  }

  // The SECOND way this job can publish a plausible-looking lie.
  //
  // The freshness gate above catches a fetch that did not run. It cannot catch
  // a fetch that ran an out-of-date checkout: the rows land, dated today, with
  // the right counts and a NULL in every ranking column. That is what shipped
  // for weeks — a header claiming the list was ranked by reversal above rows
  // that could not show one, and a lone "·" where the reason should have been.
  // Say it in the message rather than degrade quietly.
  const degraded = rows.every((r) => r.rev6 === null);
  if (degraded) {
    logger.error("shortlist-telegram", "Ranking columns are NULL for the whole run", {
      runDate,
      rows: rows.length,
    });
  }

  const longs = rows.filter((r) => r.side === "long").map(toMessageRow);
  const shorts = rows.filter((r) => r.side === "short").map(toMessageRow);
  const asOf = rows[0].as_of ? fmtAsOf(rows[0].as_of) : runDate;

  const lines = [
    HEADER,
    `_4h bars · ${asOf}_`,
    "",
    ...(degraded
      ? ["⚠️ _Ranking data missing — order is not meaningful. The fetch box is on an old checkout._", ""]
      : []),
    ...renderSide(longs, "📈 *LONG*"),
    ...renderSide(shorts, "📉 *SHORT*"),
    ...footer([...longs, ...shorts]),
  ];

  logger.info("shortlist-telegram", "Sending shortlist", {
    runDate,
    longs: longs.length,
    shorts: shorts.length,
    degraded,
  });

  const ok = await send(lines.join("\n"), true);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  logger.error("shortlist-telegram", "Send crashed", { error: err });
  process.exit(1);
});
