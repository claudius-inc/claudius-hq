/**
 * Daily "Crypto Movers" Telegram report.
 *
 * Run with:
 *   npx tsx scripts/pipelines/run-crypto-report.ts
 *
 * Screen logic lives in src/lib/markets/crypto-screen.ts. This script is the
 * orchestration shell: fetch -> screen -> persist -> send.
 *
 * Persistence matters here more than anywhere else in the repo: the previous
 * version logged only "Crypto report sent OK" and never recorded which coins it
 * chose, so the screen was unfalsifiable — there was no way to measure whether
 * a single pick ever worked. Every CANDIDATE is now stored (not just the
 * reported top N) so the TOP_N cutoff is evaluable too, and the full top-1000
 * close is stored so forward returns are a self-join rather than a backfill job.
 */
import {
  fetchTopCoins,
  normalizeCoins,
  screenCoins,
  type ScreenedCoin,
} from "@/lib/markets/crypto-screen";
import { rawClient } from "@/db";
import { logger } from "@/lib/logger";

const TG = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;

async function send(text: string): Promise<boolean> {
  if (!TG || !CHAT) {
    logger.warn("crypto-report", "Telegram credentials missing; skipping send");
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "Markdown" }),
  });
  if (!res.ok) {
    logger.error("crypto-report", "Telegram send failed", {
      status: res.status,
      body: (await res.text()).slice(0, 300),
    });
    return false;
  }
  return true;
}

// Backtick included: an unpaired one in a coin name 400s the whole message.
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

async function main() {
  const runDate = new Date().toISOString().split("T")[0];
  const key = process.env.COINGECKO_API_KEY || "";

  const raw = await fetchTopCoins(key);
  const all = normalizeCoins(raw);

  // A 200 response carrying a short or empty list would otherwise surface as
  // "no coins cleared the screen" — a market observation, when it is really a
  // data outage. Fail loudly instead.
  if (all.length < 500) {
    throw new Error(`CoinGecko returned only ${all.length} coins; expected ~1000`);
  }

  const { universe, candidates, ranked, passMN, passGN, btc, btcMissing } = screenCoins(all);

  if (btcMissing) {
    logger.warn("crypto-report", "Bitcoin absent from pull; relative-strength gates degraded");
  }

  logger.info("crypto-report", "Screen complete", {
    runDate,
    universe: universe.length,
    passM: passMN,
    passG: passGN,
    union: candidates.length,
    reported: ranked.length,
    picks: ranked.map((c) => ({ id: c.id, sym: c.sym, tag: c.tag, score: c.score })),
  });

  const reportedIds = new Set(ranked.map((c) => c.id));

  // Funnel counts. Without these an empty report is indistinguishable from a
  // broken fetch, and the screen constants cannot be tuned.
  await rawClient.execute({
    sql: `INSERT INTO crypto_screen_runs
            (run_date, universe_n, pass_m_n, pass_g_n, union_n, reported_n, btc_p24, btc_p7, btc_p30)
          VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(run_date) DO UPDATE SET
            universe_n=excluded.universe_n, pass_m_n=excluded.pass_m_n,
            pass_g_n=excluded.pass_g_n, union_n=excluded.union_n,
            reported_n=excluded.reported_n, btc_p24=excluded.btc_p24,
            btc_p7=excluded.btc_p7, btc_p30=excluded.btc_p30`,
    args: [runDate, universe.length, passMN, passGN, candidates.length, ranked.length,
           btc.p24, btc.p7, btc.p30],
  });

  // Delete-then-insert in ONE batch (a single implicit transaction) so a
  // same-day re-run is last-run-wins rather than a merge. An upsert that
  // touched only rank/tag/score would leave chimera rows — an afternoon score
  // beside morning p24/p7/p30 inputs, so the stored score no longer follows
  // from the stored inputs — and would strand `reported=1` on coins that
  // dropped out of the afternoon screen entirely.
  await rawClient.batch(
    [
      { sql: "DELETE FROM crypto_screen_picks WHERE run_date = ?", args: [runDate] },
      ...candidates.map((c: ScreenedCoin, i: number) => ({
        sql: `INSERT INTO crypto_screen_picks
                (coin_id, run_date, sym, name, rank, tag, reported, score, price, mcap, vol, fdv,
                 p24, p7, p30, athc, last24_share, rising_frac, dd_from_high, btc_p7, btc_p30)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [c.id, runDate, c.sym, c.name, i + 1, c.tag, reportedIds.has(c.id) ? 1 : 0,
               c.score, c.price, c.mcap, c.vol, c.fdv,
               c.p24, c.p7, c.p30, c.athc,
               c.spark?.last24Share ?? null, c.spark?.risingFrac ?? null, c.spark?.ddFromHigh ?? null,
               btc.p7, btc.p30],
      })),
    ],
    "write",
  );

  // Daily close for the whole pull — same response, no extra API calls.
  const priceRows = all.filter((c) => c.id && c.price !== null);
  for (let i = 0; i < priceRows.length; i += 200) {
    await rawClient.batch(
      priceRows.slice(i, i + 200).map((c) => ({
        sql: `INSERT INTO crypto_prices_daily (coin_id, date, price, mcap, vol)
              VALUES (?,?,?,?,?)
              ON CONFLICT(coin_id, date) DO UPDATE SET
                price=excluded.price, mcap=excluded.mcap, vol=excluded.vol`,
        args: [c.id, runDate, c.price, c.mcap, c.vol],
      })),
      "write",
    );
  }

  if (ranked.length === 0) {
    const ok = await send(
      "🪙 *Crypto Movers*\n\nNo coins cleared the screen today.\n\n" +
        `_Universe ${universe.length} · momentum ${passMN} · breakout ${passGN}_`,
    );
    if (!ok) process.exitCode = 1;
    return;
  }

  // Heat bar min-max scaled across the shown scores so relative strength stays
  // scannable even when scores cluster high.
  const scores = ranked.map((c) => c.score);
  const minS = Math.min(...scores);
  const maxS = Math.max(...scores);
  const span = maxS - minS || 1;
  const bar = (s: number) => "█".repeat(Math.max(1, Math.round(((s - minS) / span) * 8)));
  const labelWidth = Math.max(...ranked.map((c) => String(c.score).length));
  const bt = "`";

  const lines = [
    `🪙 *Crypto Movers — Top ${ranked.length}*`,
    "_⭐ both · 📈 momentum · 🚀 breakout · score 0-100_",
    "",
  ];
  ranked.forEach((c, i) => {
    const name = c.name ? ` · ${clean(c.name)}` : "";
    const pr = fmtPrice(c.price);
    const ath =
      c.athc === null || c.athc === undefined
        ? ""
        : c.athc >= -1
          ? "🔺ATH"
          : `ATH ${Math.round(c.athc)}%`;
    const cell = String(c.score).padEnd(labelWidth) + " " + bar(c.score);
    lines.push(
      `${i + 1}. ${bt}${c.sym}${bt} ${c.emoji}${name}${pr ? ` · ${pr}` : ""}${ath ? ` · ${ath}` : ""}`,
    );
    lines.push(`   ${bt}${cell}${bt} · 24h ${pct(c.p24)} · 7d ${pct(c.p7)} · 30d ${pct(c.p30)}`);
    lines.push("");
  });
  lines.push(
    `_${candidates.length} of ${universe.length} coins cleared the screen · BTC 7d ${pct(btc.p7)}_`,
  );

  const ok = await send(lines.join("\n"));
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  logger.error("crypto-report", "Report crashed", { error: err });
  process.exit(1);
});
