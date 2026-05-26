const { createClient } = require('@libsql/client');

async function main() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });

  const result = await db.execute(`
    SELECT 
      t.name,
      COUNT(tm.ticker) as stock_count,
      ROUND(AVG(tm.momentum_score), 1) as avg_momentum,
      ROUND(AVG(tm.technical_score), 1) as avg_technical,
      ROUND(AVG(tm.price_change_1w), 1) as avg_1w,
      ROUND(AVG(tm.price_change_1m), 1) as avg_1m,
      ROUND(AVG(tm.price_change_3m), 1) as avg_3m
    FROM themes t
    JOIN theme_stocks ts ON t.id = ts.theme_id
    JOIN ticker_metrics tm ON ts.ticker = tm.ticker
    WHERE tm.computed_at >= (SELECT MAX(computed_at) FROM ticker_metrics)
    GROUP BY t.id, t.name
    HAVING stock_count >= 3
    ORDER BY avg_momentum DESC
    LIMIT 15
  `);
  console.table(result.rows);
}

main().catch(e => console.error(e));
