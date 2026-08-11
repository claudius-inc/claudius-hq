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

const TG = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;
const DRY_RUN = process.argv.includes("--dry-run");

interface Row {
  base: string;
  side: string;
  category: string;
  score: number;
  max_score: number;
  factors: string | null;
  price: number | null;
  rsi: number | null;
  change_pct: number | null;
  vol_pctl: number | null;
  vwap_dist_pct: number | null;
  oi_change_pct: number | null;
  rvol: number | null;
  rev6: number | null;
  funding_abs: number | null;
  combo_score: number | null;
  combo_gated: number | null;
  run_date: string;
  as_of: string | null;
}

async function send(text: string): Promise<boolean> {
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
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "Markdown" }),
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

// Backtick included: an unpaired one in a base name 400s the whole message.
const clean = (s: string) => String(s).replace(/[_*[\]`]/g, "").trim();

const pct = (v: number | null) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function fmtPrice(p: number | null): string {
  if (p === null || p === undefined) return "";
  if (p >= 1000) return "$" + Math.round(p).toLocaleString("en-US");
  if (p >= 1) return "$" + p.toFixed(2);
  if (p >= 0.01) return "$" + p.toFixed(4);
  return "$" + Number(p).toPrecision(2);
}

const CATEGORY_TAG: Record<string, string> = {
  crypto: "",
  equity: "📊",
  premarket: "🚀",
  commodity: "🛢",
  index: "📉",
};

/** `Q` first — quarterly VWAP is worth 2 points, the others 1 each. */
function factorInitials(json: string | null, score: number): string {
  if (!json) return "";
  try {
    const f = JSON.parse(json) as Record<string, boolean>;
    const on: string[] = [];
    const plain = Object.values(f).filter(Boolean).length;
    if (score - plain >= 2) on.push("Q");
    if (f.trend) on.push("T");
    if (f.pullback) on.push("P");
    if (f.support) on.push("S");
    if (f.proximity) on.push("X");
    if (f.vsa) on.push("V");
    return on.join("");
  } catch {
    return "";
  }
}

function compression(v: number | null): string {
  if (v === null) return "";
  if (v <= 25) return ` 🪤coiled ${Math.round(v)}`;
  if (v >= 75) return ` 🌊moving ${Math.round(v)}`;
  return ` vol ${Math.round(v)}`;
}

/**
 * The composite ranking line — why this name sits where it does.
 *
 * `⚡` means the name cleared the volume-and-funding gate. The 1-day move is
 * printed as the MOVE, not as the stored `rev6`, which is its negation: a long
 * candidate that fell 8% should read "1d -8.0%".
 */
function compositeLine(r: Row): string {
  const bits: string[] = [r.combo_gated ? "⚡" : "·"];
  if (r.rev6 !== null) bits.push(`1d ${pct(-r.rev6)}`);
  if (r.rvol !== null) bits.push(`rvol ${r.rvol.toFixed(1)}x`);
  if (r.funding_abs !== null) bits.push(`|fund| ${(r.funding_abs * 10_000).toFixed(1)}bp`);
  return bits.join(" · ");
}

function renderSide(rows: Row[], heading: string): string[] {
  if (!rows.length) return [heading, "_none cleared the threshold_", ""];
  const lines = [heading];
  rows.forEach((r, i) => {
    const tag = CATEGORY_TAG[r.category] ?? "";
    lines.push(
      `${i + 1}. \`${clean(r.base)}\`${tag ? " " + tag : ""} ` +
        `*${r.score}/${r.max_score}* · ${fmtPrice(r.price)}`,
    );
    lines.push(`   ${compositeLine(r)}`);
    lines.push(
      `   \`${factorInitials(r.factors, r.score).padEnd(6)}\` · OI ${pct(r.oi_change_pct)}` +
        ` · qVWAP ${pct(r.vwap_dist_pct)} · RSI ${r.rsi === null ? "—" : Math.round(r.rsi)}` +
        compression(r.vol_pctl),
    );
  });
  lines.push("");
  return lines;
}

async function main() {
  const res = await rawClient.execute(`
    SELECT base, side, category, score, max_score, factors, price, rsi,
           change_pct, vol_pctl, vwap_dist_pct, oi_change_pct,
           rvol, rev6, funding_abs, combo_score, combo_gated,
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

  const longs = rows.filter((r) => r.side === "long");
  const shorts = rows.filter((r) => r.side === "short");
  const asOf = rows[0].as_of ? `${rows[0].as_of.replace("T", " ").slice(0, 16)}Z` : runDate;

  const lines = [
    "🎯 *Convergence — Binance Perps*",
    `_Ranked by reversal within busy, funding-stressed names · 4h bars · as of ${asOf}_`,
    "",
    ...renderSide(longs, "📈 *LONG*"),
    ...renderSide(shorts, "📉 *SHORT*"),
    "_⚡ cleared the volume+funding gate · order is by 1d reversal within the gate_",
    "_Q=quarterly VWAP (2pts) T=trend P=pullback S=support X=extreme V=volume_",
    "_🪤 coiled · 🌊 moving (own-history volatility rank)_",
    "_⚠️ A shortlist to review, not signals. The ORDER is validated (holdout IC " +
      "0.078, t=5.97); the PROFIT is not (top-10 basket t=0.15)._",
  ];

  logger.info("shortlist-telegram", "Sending shortlist", {
    runDate,
    longs: longs.length,
    shorts: shorts.length,
  });

  const ok = await send(lines.join("\n"));
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  logger.error("shortlist-telegram", "Send crashed", { error: err });
  process.exit(1);
});
