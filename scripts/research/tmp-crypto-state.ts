/** Inspects crypto screen data state. Temporary. */
import { rawClient } from "@/db";

async function main() {
  const q = async (s: string) => JSON.stringify((await rawClient.execute(s)).rows);
  console.log("screen runs:", await q("SELECT run_date, universe_n, pass_m_n, pass_g_n, union_n, reported_n FROM crypto_screen_runs ORDER BY run_date DESC LIMIT 5"));
  console.log("picks by date:", await q("SELECT run_date, COUNT(*) n, SUM(reported) rep FROM crypto_screen_picks GROUP BY run_date ORDER BY run_date DESC LIMIT 5"));
  console.log("prices by date:", await q("SELECT date, COUNT(*) n FROM crypto_prices_daily GROUP BY date ORDER BY date DESC LIMIT 5"));
  console.log("sample picks:", await q("SELECT coin_id, sym, tag, reported, price, p24, p7, p30 FROM crypto_screen_picks ORDER BY run_date DESC, rank LIMIT 5"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
