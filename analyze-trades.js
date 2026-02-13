const { createClient } = require('@libsql/client');
require('dotenv').config({ path: './.env.local' });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function analyze() {
  // Get all trades
  const trades = await client.execute('SELECT * FROM ibkr_trades ORDER BY trade_date ASC');
  console.log('=== TRADING ANALYSIS ===');
  console.log('Total trades:', trades.rows.length);
  console.log('Date range:', trades.rows[0]?.trade_date, 'to', trades.rows[trades.rows.length-1]?.trade_date);
  
  // Group by symbol
  const bySymbol = {};
  const byCurrency = {};
  let totalBuyValueSGD = 0;
  let totalSellValueSGD = 0;
  let wins = 0;
  let losses = 0;
  let totalWinAmount = 0;
  let totalLossAmount = 0;
  
  for (const t of trades.rows) {
    const sym = t.symbol;
    if (!bySymbol[sym]) bySymbol[sym] = { buys: [], sells: [], currency: t.currency };
    
    const trade = {
      date: t.trade_date,
      action: t.action,
      qty: Number(t.quantity),
      price: Number(t.price),
      total: Number(t.quantity) * Number(t.price),
      realizedPnl: Number(t.realized_pnl || 0),
      fxRate: Number(t.fx_rate || 1)
    };
    
    if (t.action === 'BUY') {
      bySymbol[sym].buys.push(trade);
      totalBuyValueSGD += trade.total * trade.fxRate;
      byCurrency[t.currency] = (byCurrency[t.currency] || 0) + trade.total * trade.fxRate;
    } else {
      bySymbol[sym].sells.push(trade);
      totalSellValueSGD += trade.total * trade.fxRate;
      const pnlSGD = trade.realizedPnl * trade.fxRate;
      if (trade.realizedPnl > 0) {
        wins++;
        totalWinAmount += pnlSGD;
      } else if (trade.realizedPnl < 0) {
        losses++;
        totalLossAmount += Math.abs(pnlSGD);
      }
    }
  }
  
  console.log('\n=== TRADING VOLUME (SGD) ===');
  console.log('Total Bought:', totalBuyValueSGD.toFixed(2));
  console.log('Total Sold:', totalSellValueSGD.toFixed(2));
  
  console.log('\n=== CURRENCY EXPOSURE (Buy Volume SGD) ===');
  for (const [cur, val] of Object.entries(byCurrency).sort((a,b) => b[1] - a[1])) {
    const pct = (val / totalBuyValueSGD * 100).toFixed(1);
    console.log(`  ${cur}: ${val.toFixed(2)} (${pct}%)`);
  }
  
  console.log('\n=== WIN/LOSS ANALYSIS ===');
  console.log('Winning sell trades:', wins);
  console.log('Losing sell trades:', losses);
  console.log('Win rate:', ((wins / (wins + losses)) * 100).toFixed(1) + '%');
  console.log('Total gains:', totalWinAmount.toFixed(2), 'SGD');
  console.log('Total losses:', totalLossAmount.toFixed(2), 'SGD');
  console.log('Avg win:', (totalWinAmount / wins).toFixed(2), 'SGD');
  console.log('Avg loss:', (totalLossAmount / losses).toFixed(2), 'SGD');
  console.log('Profit factor:', (totalWinAmount / totalLossAmount).toFixed(2));
  
  console.log('\n=== BY SYMBOL (sorted by trade count) ===');
  const symbolStats = [];
  for (const [sym, data] of Object.entries(bySymbol)) {
    const totalBought = data.buys.reduce((s, t) => s + t.qty, 0);
    const totalSold = data.sells.reduce((s, t) => s + t.qty, 0);
    const buyValue = data.buys.reduce((s, t) => s + t.total, 0);
    const sellValue = data.sells.reduce((s, t) => s + t.total, 0);
    const avgBuyPrice = totalBought > 0 ? buyValue / totalBought : 0;
    const avgSellPrice = totalSold > 0 ? sellValue / totalSold : 0;
    const realizedPnlSGD = data.sells.reduce((s, t) => s + t.realizedPnl * t.fxRate, 0);
    const netQty = totalBought - totalSold;
    
    symbolStats.push({
      symbol: sym,
      currency: data.currency,
      trades: data.buys.length + data.sells.length,
      bought: totalBought,
      sold: totalSold,
      netQty,
      avgBuy: avgBuyPrice,
      avgSell: avgSellPrice,
      realizedPnlSGD,
      status: netQty === 0 ? 'CLOSED' : 'OPEN',
      pnlPct: avgBuyPrice > 0 && totalSold > 0 ? ((avgSellPrice - avgBuyPrice) / avgBuyPrice * 100) : 0
    });
  }
  
  symbolStats.sort((a, b) => b.trades - a.trades);
  
  console.log('Symbol | Currency | Trades | Status | Realized P&L (SGD) | Avg Buy→Sell | Return %');
  console.log('-'.repeat(90));
  for (const s of symbolStats) {
    const returnStr = s.sold > 0 ? s.pnlPct.toFixed(1) + '%' : 'N/A';
    console.log(`${s.symbol.padEnd(8)} | ${s.currency.padEnd(8)} | ${String(s.trades).padEnd(6)} | ${s.status.padEnd(6)} | ${s.realizedPnlSGD.toFixed(2).padStart(12)} | ${s.avgBuy.toFixed(2)} → ${s.avgSell.toFixed(2)} | ${returnStr}`);
  }
  
  console.log('\n=== HOLDING PERIODS ===');
  let holdingPeriods = [];
  for (const [sym, data] of Object.entries(bySymbol)) {
    if (data.buys.length > 0 && data.sells.length > 0) {
      const firstBuy = new Date(data.buys[0].date);
      const lastSell = new Date(data.sells[data.sells.length - 1].date);
      const days = Math.floor((lastSell - firstBuy) / (1000 * 60 * 60 * 24));
      if (days >= 0) {
        holdingPeriods.push({ symbol: sym, days });
      }
    }
  }
  
  holdingPeriods.sort((a, b) => a.days - b.days);
  for (const h of holdingPeriods) {
    console.log(`  ${h.symbol}: ${h.days} days`);
  }
  
  if (holdingPeriods.length > 0) {
    const avgHold = holdingPeriods.reduce((a, b) => a + b.days, 0) / holdingPeriods.length;
    console.log(`\nAverage holding period: ${avgHold.toFixed(1)} days`);
    console.log(`Shortest: ${holdingPeriods[0].symbol} (${holdingPeriods[0].days} days)`);
    console.log(`Longest: ${holdingPeriods[holdingPeriods.length-1].symbol} (${holdingPeriods[holdingPeriods.length-1].days} days)`);
  }
  
  // Best and worst trades
  console.log('\n=== TOP 3 WINNERS ===');
  const allSells = [];
  for (const t of trades.rows) {
    if (t.action === 'SELL') {
      allSells.push({
        symbol: t.symbol,
        date: t.trade_date,
        pnlSGD: Number(t.realized_pnl) * Number(t.fx_rate),
        qty: t.quantity,
        price: t.price
      });
    }
  }
  allSells.sort((a, b) => b.pnlSGD - a.pnlSGD);
  for (let i = 0; i < 3 && i < allSells.length; i++) {
    const t = allSells[i];
    console.log(`  ${t.symbol} on ${t.date}: +${t.pnlSGD.toFixed(2)} SGD`);
  }
  
  console.log('\n=== TOP 3 LOSERS ===');
  allSells.sort((a, b) => a.pnlSGD - b.pnlSGD);
  for (let i = 0; i < 3 && i < allSells.length; i++) {
    const t = allSells[i];
    console.log(`  ${t.symbol} on ${t.date}: ${t.pnlSGD.toFixed(2)} SGD`);
  }
  
  // Total P&L
  const totalRealizedPnL = allSells.reduce((s, t) => s + t.pnlSGD, 0);
  console.log('\n=== TOTAL REALIZED P&L ===');
  console.log('SGD:', totalRealizedPnL.toFixed(2));
}

analyze().catch(console.error);
