#!/usr/bin/env npx tsx
import { createClient } from "@libsql/client";

const US_CURATED = [
  "NBIS", "CRWV", "APLD", "SMCI", "VRT", "ANET",
  "PLTR", "SNOW", "DDOG", "MDB", "NET", "CFLT",
  "CRWD", "PANW", "ZS", "S",
  "AFRM", "SOFI", "DLO", "TOST", "SQ", "PYPL",
  "SHOP", "MELI", "SE", "DUOL", "AMZN",
  "HIMS", "DOCS", "CERT",
  "ENPH", "SEDG", "RIVN", "LCID", "TSLA",
  "RKLB", "PL", "ASTS",
  "AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMD",
  "CELH", "AXON", "TTD", "BILL",
];

const SGX_TICKERS = [
  "D05.SI", "O39.SI", "U11.SI", "Z74.SI", "C6L.SI", "C09.SI",
  "S58.SI", "U14.SI", "S63.SI", "V03.SI", "BS6.SI", "G13.SI",
  "BN4.SI", "Y92.SI", "F34.SI", "S68.SI", "H78.SI", "U96.SI",
  "9CI.SI", "A17U.SI", "M44U.SI", "N2IU.SI", "ME8U.SI", "BUOU.SI",
  "J36.SI", "C38U.SI", "J69U.SI", "T39.SI", "CC3.SI", "C52.SI",
  "H02.SI", "E5H.SI", "BHG.SI", "OV8.SI", "BRS.SI",
  "T82U.SI", "SK6U.SI", "OXMU.SI", "AU8U.SI", "BTOU.SI",
  "AJBU.SI", "CRPU.SI", "CY6U.SI", "JYEU.SI", "A7RU.SI", "C2PU.SI",
  "J91U.SI", "DHLU.SI", "K71U.SI", "UD1U.SI", "MXNU.SI", "HMN.SI",
  "CWBU.SI", "C61U.SI", "Q1P.SI", "TS0U.SI", "RW0U.SI",
  "F25.SI", "P40U.SI", "S59.SI", "A26.SI", "L38.SI", "E28.SI",
  "H13.SI", "NO4.SI", "U06.SI", "H15.SI", "N03.SI", "K03.SI",
  "BN2.SI", "AWX.SI", "S85.SI", "1D0.SI", "BDR.SI",
  "EB5.SI", "5GD.SI", "AZR.SI", "Y35.SI", "RF7.SI", "5GI.SI",
  "BHK.SI", "5HG.SI", "1A1.SI", "L02.SI", "T14.SI", "5CF.SI",
  "BQF.SI", "E3B.SI", "5DD.SI", "OYY.SI", "AGS.SI", "5GF.SI",
  "502.SI", "A04.SI", "5OI.SI", "42S.SI", "40T.SI", "1A4.SI",
];

const HK_TICKERS = [
  "0005.HK", "0011.HK", "0016.HK", "0017.HK", "0027.HK", "0066.HK",
  "0175.HK", "0241.HK", "0267.HK", "0288.HK", "0386.HK", "0388.HK",
  "0669.HK", "0700.HK", "0762.HK", "0823.HK", "0857.HK", "0883.HK",
  "0939.HK", "0941.HK", "0960.HK", "0968.HK", "1038.HK", "1044.HK",
  "1093.HK", "1109.HK", "1177.HK", "1211.HK", "1299.HK", "1398.HK",
  "1810.HK", "1876.HK", "1928.HK", "1997.HK", "2007.HK", "2018.HK",
  "2020.HK", "2269.HK", "2313.HK", "2318.HK", "2319.HK", "2331.HK",
  "2382.HK", "2388.HK", "2628.HK", "2688.HK", "3690.HK", "3968.HK",
  "3988.HK", "6098.HK", "6862.HK", "9618.HK", "9888.HK", "9988.HK",
  "9999.HK",
];

async function seed() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  const all = [
    ...US_CURATED.map(t => ({ ticker: t, market: "US" })),
    ...SGX_TICKERS.map(t => ({ ticker: t, market: "SGX" })),
    ...HK_TICKERS.map(t => ({ ticker: t, market: "HK" })),
  ];

  // Deduplicate
  const seen = new Set<string>();
  const unique = all.filter(({ ticker }) => {
    if (seen.has(ticker)) return false;
    seen.add(ticker);
    return true;
  });

  let added = 0;
  for (const { ticker, market } of unique) {
    try {
      await client.execute({
        sql: "INSERT OR IGNORE INTO scanner_universe (ticker, market, source, enabled) VALUES (?, ?, 'curated', 1)",
        args: [ticker, market],
      });
      added++;
    } catch (e) {
      // Skip duplicates
    }
  }

  const result = await client.execute("SELECT market, COUNT(*) as cnt FROM scanner_universe GROUP BY market");
  console.log(`Seeded ${added} tickers`);
  console.log("By market:");
  for (const row of result.rows) {
    console.log(`  ${row.market}: ${row.cnt}`);
  }
}

seed().catch(console.error);
