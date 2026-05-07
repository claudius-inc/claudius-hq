/**
 * Phase A probe — does Eastmoney still publish HK southbound net flow?
 *
 * Northbound (CN) net-flow figures froze in Aug 2024 (see
 * src/lib/markets/flows/cn.ts). Southbound (HK) might share the freeze
 * since the publication is tied to the same Stock Connect framework.
 *
 * Run:
 *   npx tsx scripts/probe-hk-southbound.ts
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Row {
  MUTUAL_TYPE: string;
  TRADE_DATE: string;
  DEAL_AMT: number | null;
  NET_DEAL_AMT: number | null;
  BUY_AMT: number | null;
  SELL_AMT: number | null;
  FUND_INFLOW: number | null;
}

async function probe(mutualType: string) {
  const params = new URLSearchParams({
    reportName: "RPT_MUTUAL_DEAL_HISTORY",
    columns: "MUTUAL_TYPE,TRADE_DATE,DEAL_AMT,NET_DEAL_AMT,BUY_AMT,SELL_AMT,FUND_INFLOW",
    source: "WEB",
    pageNumber: "1",
    pageSize: "10",
    sortColumns: "TRADE_DATE",
    sortTypes: "-1",
    filter: `(MUTUAL_TYPE="${mutualType}")`,
  });
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?${params.toString()}`;
  console.log(`\n=== MUTUAL_TYPE=${mutualType} ===`);
  console.log("URL:", url);

  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json,text/plain,*/*",
      Referer: "https://data.eastmoney.com/",
    },
    signal: AbortSignal.timeout(10_000),
  });
  console.log("status:", r.status);
  const txt = await r.text();
  let json: { success?: boolean; result?: { data?: Row[] } | null };
  try {
    json = JSON.parse(txt);
  } catch {
    console.log("non-JSON, head:", txt.slice(0, 200));
    return;
  }
  const rows = json.result?.data ?? [];
  console.log("rows:", rows.length);
  for (const r0 of rows.slice(0, 5)) {
    console.log({
      date: r0.TRADE_DATE,
      DEAL_AMT: r0.DEAL_AMT,
      NET_DEAL_AMT: r0.NET_DEAL_AMT,
      BUY_AMT: r0.BUY_AMT,
      SELL_AMT: r0.SELL_AMT,
      FUND_INFLOW: r0.FUND_INFLOW,
    });
  }
  // Frozen-detector: are NET_DEAL_AMT all null in the 10-row window?
  const allNetNull = rows.every((row) => row.NET_DEAL_AMT === null);
  const allDealNull = rows.every((row) => row.DEAL_AMT === null);
  console.log(`→ NET_DEAL_AMT all-null in window: ${allNetNull}`);
  console.log(`→ DEAL_AMT     all-null in window: ${allDealNull}`);
}

async function probeYahoo() {
  console.log("\n=== Phase B probe (yahoo: ^HSI dividend yield, ^TNX) ===");
  const yahoo = await import("yahoo-finance2");
  const yf = new yahoo.default({ suppressNotices: ["yahooSurvey"] });

  for (const sym of ["^HSI", "^TNX", "HSI"]) {
    try {
      const q = (await yf.quote(sym)) as Record<string, unknown>;
      console.log(`-- ${sym} --`);
      console.log({
        regularMarketPrice: q.regularMarketPrice,
        trailingAnnualDividendYield: q.trailingAnnualDividendYield,
        dividendYield: q.dividendYield,
        yield: q.yield,
        fiftyDayAverage: q.fiftyDayAverage,
        twoHundredDayAverage: q.twoHundredDayAverage,
        currency: q.currency,
        quoteType: q.quoteType,
        shortName: q.shortName,
      });
    } catch (e) {
      console.log(`${sym}: ERROR ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function main() {
  // Phase A — both southbound directions
  for (const t of ["002", "004"]) {
    try {
      await probe(t);
    } catch (e) {
      console.error("ERROR:", e instanceof Error ? e.message : String(e));
    }
  }
  // Always also probe Phase B so we know what's available regardless.
  await probeYahoo();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
