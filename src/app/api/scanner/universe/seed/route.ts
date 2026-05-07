import { db } from "@/db";
import { scannerUniverse } from "@/db/schema";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

// Curated US stocks (high-conviction names)
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

// Comprehensive SGX list
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
  "P8Z.SI", "544.SI", "564.SI", "S08.SI", "NR7.SI", "CFA.SI",
  "J85.SI", "5JS.SI", "T15.SI", "5AI.SI", "CHJ.SI", "F17.SI",
  "TQ5.SI", "5G1.SI", "H30.SI", "C8R.SI", "5I4.SI", "YF8.SI", "Z25.SI",
  "S51.SI", "M05.SI", "5G4.SI", "BLU.SI", "5TP.SI", "AWG.SI", "O2I.SI",
  "5OQ.SI", "BTP.SI", "5LY.SI", "ER0.SI", "Q0F.SI", "WJP.SI", "D01.SI",
  "5OT.SI", "1A0.SI", "BSL.SI", "MZH.SI", "U10.SI", "T13.SI", "Z59.SI", "S20.SI",
  "BDX.SI", "S71.SI", "NC2.SI",
  "RE4.SI", "CLW.SI", "BEW.SI", "AIY.SI", "GRQ.SI", "BKW.SI", "1F3.SI", "P15.SI", "U09.SI", "A30.SI",
];

// Comprehensive HKEX list
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
  "9999.HK", "0268.HK", "0772.HK", "0981.HK", "1024.HK", "1347.HK",
  "2400.HK", "6618.HK", "9698.HK", "9626.HK", "9961.HK",
  "0020.HK", "3888.HK", "6060.HK", "1833.HK", "9866.HK", "9868.HK",
  "2601.HK", "0998.HK", "1658.HK", "6881.HK", "1988.HK", "3328.HK",
  "0012.HK", "0001.HK", "0083.HK", "0101.HK", "0688.HK", "0683.HK",
  "0003.HK", "0004.HK", "1113.HK", "0014.HK", "2202.HK", "0881.HK",
  "3383.HK", "1972.HK", "2669.HK", "0813.HK", "3900.HK",
  "0291.HK", "0322.HK", "0151.HK", "0168.HK", "0220.HK", "9633.HK",
  "1458.HK", "0914.HK", "6969.HK", "0992.HK",
  "2359.HK", "6160.HK", "1801.HK", "2196.HK", "1066.HK", "3692.HK",
  "6127.HK", "9926.HK", "9995.HK", "2186.HK", "1952.HK", "6185.HK",
  "1088.HK", "1800.HK", "2600.HK", "0390.HK", "3898.HK",
  "1818.HK", "0358.HK", "1071.HK",
  "2015.HK", "2238.HK", "0489.HK", "1958.HK", "6699.HK", "2333.HK",
  "0867.HK", "0285.HK", "3808.HK", "0728.HK", "6823.HK",
  "0002.HK", "0006.HK", "0836.HK", "0384.HK", "0135.HK", "0270.HK", "1083.HK",
  "2778.HK", "0435.HK", "0778.HK", "1881.HK", "1426.HK", "0405.HK", "1503.HK", "0087.HK",
  "0966.HK", "1336.HK", "6186.HK", "1339.HK", "2328.HK",
];

// Curated LSE blue chips
const LSE_TICKERS = [
  "HSBA.L", "BARC.L", "RIO.L", "AZN.L", "SHEL.L",
  "ULVR.L", "GSK.L", "BP.L", "LLOY.L", "VOD.L",
];

// POST /api/scanner/universe/seed - Seed the database with initial tickers
export async function POST() {
  try {
    let added = 0;
    let skipped = 0;

    const allTickers = [
      ...US_CURATED.map((t) => ({ ticker: t, market: "US" })),
      ...SGX_TICKERS.map((t) => ({ ticker: t, market: "SGX" })),
      ...HK_TICKERS.map((t) => ({ ticker: t, market: "HK" })),
      ...LSE_TICKERS.map((t) => ({ ticker: t, market: "LSE" })),
    ];

    // Deduplicate
    const seen = new Set<string>();
    const unique = allTickers.filter((t) => {
      if (seen.has(t.ticker)) return false;
      seen.add(t.ticker);
      return true;
    });

    for (const { ticker, market } of unique) {
      try {
        await db
          .insert(scannerUniverse)
          .values({
            ticker,
            market,
            source: "curated",
            enabled: true,
          })
          .onConflictDoNothing();
        added++;
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      added,
      skipped,
      total: unique.length,
      byMarket: {
        US: US_CURATED.length,
        SGX: new Set(SGX_TICKERS).size,
        HK: new Set(HK_TICKERS).size,
        LSE: new Set(LSE_TICKERS).size,
      },
    });
  } catch (error) {
    console.error("Error seeding scanner universe:", error);
    return NextResponse.json(
      { error: "Failed to seed database" },
      { status: 500 }
    );
  }
}

// GET - Check seed status
export async function GET() {
  try {
    const counts = await db
      .select({
        market: scannerUniverse.market,
        count: sql<number>`count(*)`,
      })
      .from(scannerUniverse)
      .groupBy(scannerUniverse.market);

    const total = counts.reduce((sum, c) => sum + c.count, 0);

    return NextResponse.json({
      seeded: total > 0,
      total,
      byMarket: Object.fromEntries(counts.map((c) => [c.market, c.count])),
    });
  } catch (error) {
    console.error("Error checking seed status:", error);
    return NextResponse.json(
      { error: "Failed to check seed status" },
      { status: 500 }
    );
  }
}
