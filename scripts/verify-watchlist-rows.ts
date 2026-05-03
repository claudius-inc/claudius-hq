import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const c = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
async function go() {
  const counts = await c.execute("SELECT data_quality, COUNT(*) as n FROM watchlist_scores GROUP BY data_quality");
  console.log("by quality:", counts.rows);
  const top = await c.execute("SELECT ticker, name, market, momentum_score, technical_score, price_change_1w FROM watchlist_scores WHERE data_quality='ok' ORDER BY momentum_score DESC LIMIT 5");
  console.log("top 5 by momentum:"); top.rows.forEach((r: any) => console.log(`  ${r.ticker.padEnd(10)} ${String(r.name).slice(0,30).padEnd(30)} ${r.market} mom=${r.momentum_score} tech=${r.technical_score} 1w=${r.price_change_1w}`));
}
go();
