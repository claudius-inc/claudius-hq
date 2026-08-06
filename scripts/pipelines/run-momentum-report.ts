/**
 * Daily "Momentum Gainers" Telegram report.
 *
 * Run with:
 *   npx tsx scripts/pipelines/run-momentum-report.ts
 *
 * Selection lives in src/lib/markets/momentum-report.ts. This script is the
 * orchestration + formatting shell: select -> record -> send.
 *
 * Picks are recorded BEFORE the send so a Telegram outage cannot cost the
 * record (and so the cooldown gate sees today's selections).
 */
import {
  selectMomentumPicks,
  recordPicks,
  type MomentumPick,
} from "@/lib/markets/momentum-report";
import { getCurrencyMeta } from "@/lib/markets/yahoo-utils";
import { logger } from "@/lib/logger";

const TG = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;

async function send(text: string): Promise<boolean> {
  if (!TG || !CHAT) {
    logger.warn("momentum-report", "Telegram credentials missing; skipping send");
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "Markdown" }),
  });
  if (!res.ok) {
    logger.error("momentum-report", "Telegram send failed", {
      status: res.status,
      body: (await res.text()).slice(0, 300),
    });
    return false;
  }
  return true;
}

// Strips the legacy-Markdown control characters Telegram would choke on.
// Backtick included: an unpaired one in a company name 400s the whole message.
const clean = (s: string) => String(s).replace(/[_*[\]`]/g, "").trim();

const pct = (v: number | null) =>
  v !== null && v !== undefined ? (v >= 0 ? "+" : "") + v.toFixed(1) + "%" : "—";

/**
 * Currency-aware price tag.
 *
 * Delegates to the repo's existing getCurrencyMeta rather than re-deriving the
 * symbol table. That matters for GBp: Yahoo quotes LSE equities in PENCE, and
 * getCurrencyMeta carries the 0.01 scale. A hand-rolled `GBp -> "£"` map that
 * omits the scale renders ANTO.L at 3990 as "£3,990" instead of £39.90.
 */
function priceTag(price: number | null, currency: string | null, ticker: string): string {
  if (price === null || price === undefined) return "";
  const { symbol, scale } = getCurrencyMeta(currency, ticker);
  const scaled = price * scale;
  const num = scaled >= 10 ? Math.round(scaled).toLocaleString("en-US") : scaled.toFixed(2);
  return symbol + num;
}

function formatMessage(
  picks: MomentumPick[],
  funnel: { universe: number; ok: number; qualified: number } | null,
  priorDate: string | null,
): string {
  // Heat bar scales on technical_score, the actual ranking key, so bar length
  // agrees with list order instead of contradicting it.
  const scores = picks.map((g) => g.technical_score ?? 0);
  const minS = Math.min(...scores);
  const maxS = Math.max(...scores);
  const span = maxS - minS || 1;
  const bar = (s: number) => "█".repeat(Math.max(1, Math.round(((s - minS) / span) * 8)));

  const labelOf = (g: MomentumPick) => {
    const t = g.technical_score !== null ? Math.round(g.technical_score) : "—";
    const m = g.momentum_score !== null ? Math.round(g.momentum_score) : "—";
    return `T${t}/M${m}`;
  };
  const labelWidth = Math.max(...picks.map((g) => labelOf(g).length));

  // Wrap tickers in inline code (backtick) so Telegram does not auto-link
  // suffixes that are real TLDs (.HK, .SI, .DE, .TW…), which otherwise turn
  // some tickers into blue links and others not.
  const bt = "`";

  const lines = [
    "📈 *Momentum Gainers*",
    "_Ranked by technical structure · T=technical M=momentum (0-100)_",
    "",
  ];
  picks.forEach((g, i) => {
    const name = g.name && g.name !== g.ticker ? ` · ${clean(g.name)}` : "";
    const price = priceTag(g.price, g.currency, g.ticker);
    const cell = `${labelOf(g).padEnd(labelWidth)} ${bar(g.technical_score ?? 0)}`;
    lines.push(`${i + 1}. ${bt}${g.ticker}${bt}${name}${price ? ` · ${price}` : ""}`);
    lines.push(
      `   ${bt}${cell}${bt} · 1D ${pct(g.price_change_1d)} · 1W ${pct(g.price_change_1w)} · 1M ${pct(g.price_change_1m)}`,
    );
    lines.push("");
  });
  if (funnel) {
    lines.push(`_${funnel.qualified} of ${funnel.ok} names cleared the screen · vs ${priorDate}_`);
  }
  return lines.join("\n");
}

async function main() {
  const result = await selectMomentumPicks();

  logger.info("momentum-report", "Screen complete", {
    count: result.count,
    priorDate: result.priorDate,
    funnel: result.funnel,
  });

  // An empty list is a real outcome, not a failure: on days when nothing clears
  // the screen, saying so is the honest answer. The funnel counts distinguish
  // "no setups today" from "the pipeline broke".
  // Candidates are recorded even on an empty day: the momentum band is a
  // hypothesis under test, and the out-of-band names are precisely the control
  // group needed to re-derive it.
  await recordPicks(result.candidates, result.gainers, result.today);

  if (result.count === 0) {
    const f = result.funnel;
    const detail = f
      ? `\n\n_Universe ${f.universe} · data-ok ${f.ok} · qualified ${f.qualified} · in-band 0_`
      : "\n\n_No prior snapshot available yet._";
    const sent = await send("📊 *Momentum Gainers*\n\nNo names cleared the screen today." + detail);
    if (!sent) process.exitCode = 1;
    return;
  }

  const ok = await send(formatMessage(result.gainers, result.funnel, result.priorDate));
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  logger.error("momentum-report", "Report crashed", { error: err });
  process.exit(1);
});
