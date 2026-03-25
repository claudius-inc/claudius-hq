import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const CN_TICKERS = [
  // Shanghai Stock Exchange (.SS) - 30 tickers
  '600519.SS', '601318.SS', '600036.SS', '600276.SS', '601012.SS',
  '600900.SS', '600309.SS', '600887.SS', '601888.SS', '600030.SS',
  '601166.SS', '600000.SS', '600050.SS', '601398.SS', '601288.SS',
  '601939.SS', '601988.SS', '600028.SS', '601857.SS', '600585.SS',
  '600104.SS', '600690.SS', '601668.SS', '600703.SS', '601601.SS',
  '600438.SS', '600089.SS', '601225.SS', '600196.SS', '601628.SS',
  // Shenzhen Stock Exchange (.SZ) - 30 tickers
  '000858.SZ', '000333.SZ', '000651.SZ', '002415.SZ', '300750.SZ',
  '002594.SZ', '000001.SZ', '000002.SZ', '002304.SZ', '300059.SZ',
  '002352.SZ', '000725.SZ', '002475.SZ', '300760.SZ', '002714.SZ',
  '000538.SZ', '002027.SZ', '300124.SZ', '002241.SZ', '300015.SZ',
  '000568.SZ', '002230.SZ', '000063.SZ', '002142.SZ', '300033.SZ',
  '002601.SZ', '300014.SZ', '002032.SZ', '300274.SZ', '002050.SZ',
];

async function seed() {
  console.log(`Seeding ${CN_TICKERS.length} CN tickers...`);
  
  let inserted = 0;
  let skipped = 0;
  
  for (const ticker of CN_TICKERS) {
    try {
      const result = await db.execute({
        sql: 'INSERT OR IGNORE INTO scanner_universe (ticker, market, source, enabled, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [ticker, 'CN', 'curated', 1, new Date().toISOString()]
      });
      if (result.rowsAffected > 0) {
        inserted++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`Error inserting ${ticker}:`, err);
    }
  }
  
  console.log(`Done! Inserted: ${inserted}, Skipped (already exist): ${skipped}`);
  
  // Verify count
  const count = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM scanner_universe WHERE market = ?',
    args: ['CN']
  });
  console.log(`Total CN tickers in database: ${count.rows[0].count}`);
}

seed().catch(console.error);
