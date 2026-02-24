const XLSX = require('xlsx');

// Read and parse the CSV
const workbook = XLSX.readFile('/root/.openclaw/media/inbound/file_116---aaaf44cf-29f8-4df0-ab79-e3cdf727465f.csv');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const allData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// Parse trades
const trades = [];
for (const row of allData) {
  if (row[0] === 'Trades' && row[1] === 'Data' && row[2] === 'Order' && row[3] === 'Stocks') {
    const currency = row[4];
    const symbol = String(row[5]);
    const dateTime = row[6];
    const qty = parseFloat(String(row[7]).replace(/,/g, ''));
    const price = parseFloat(row[8]);
    const commission = Math.abs(parseFloat(row[11]) || 0);
    
    if (!isNaN(qty) && !isNaN(price)) {
      const date = String(dateTime).split(',')[0].trim();
      const action = qty > 0 ? 'BUY' : 'SELL';
      trades.push({
        date, symbol, action,
        qty: Math.abs(qty),
        price, currency, commission,
        total: Math.abs(qty) * price
      });
    }
  }
}

// Parse Realized & Unrealized Performance Summary (SGD values from IBKR)
const pnlSummary = new Map();
for (const row of allData) {
  if (row[0] === 'Realized & Unrealized Performance Summary' && row[1] === 'Data' && row[2] === 'Stocks') {
    const symbol = String(row[3]);
    const realizedProfit = parseFloat(row[5]) || 0;
    const realizedLoss = parseFloat(row[6]) || 0;
    const realizedTotal = parseFloat(row[9]) || 0;  // Already in SGD
    const unrealizedProfit = parseFloat(row[10]) || 0;
    const unrealizedLoss = parseFloat(row[11]) || 0;
    const unrealizedTotal = parseFloat(row[14]) || 0;  // Already in SGD
    const totalPnL = parseFloat(row[15]) || 0;  // Total in SGD
    
    pnlSummary.set(symbol, {
      realizedTotal,
      unrealizedTotal,
      totalPnL
    });
  }
}

console.log('P&L Summary from IBKR (in SGD):');
for (const [symbol, pnl] of pnlSummary) {
  console.log(`  ${symbol}: Realized=${pnl.realizedTotal.toFixed(2)}, Unrealized=${pnl.unrealizedTotal.toFixed(2)}, Total=${pnl.totalPnL.toFixed(2)}`);
}

// Calculate positions from trades
const positions = new Map();
for (const trade of trades) {
  if (!positions.has(trade.symbol)) {
    positions.set(trade.symbol, {
      symbol: trade.symbol,
      currency: trade.currency,
      buyQty: 0, sellQty: 0,
      buyCost: 0
    });
  }
  const pos = positions.get(trade.symbol);
  if (trade.action === 'BUY') {
    pos.buyQty += trade.qty;
    pos.buyCost += trade.total + trade.commission;
  } else {
    pos.sellQty += trade.qty;
  }
}

// Create workbook
const wb = XLSX.utils.book_new();

// 1. Trades Sheet
const tradesHeader = ['Date', 'Symbol', 'Action', 'Qty', 'Price', 'Currency', 'Commission', 'Total'];
const tradesData = [tradesHeader, ...trades.map(t => [t.date, t.symbol, t.action, t.qty, t.price, t.currency, t.commission, t.total])];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tradesData), 'Trades');

// 2. FX Rates Sheet
const fxData = [
  ['Currency', 'Rate to SGD', 'Formula (Google Sheets)'],
  ['USD', 1.35, '=GOOGLEFINANCE("CURRENCY:USDSGD")'],
  ['HKD', 0.165, '=GOOGLEFINANCE("CURRENCY:HKDSGD")'],
  ['JPY', 0.009, '=GOOGLEFINANCE("CURRENCY:JPYSGD")'],
  ['SGD', 1, '1'],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fxData), 'FX Rates');

// 3. Portfolio Sheet with IBKR's SGD P&L
const portfolioHeader = [
  'Symbol', 'Currency', 'Status', 'Shares', 
  'Avg Cost', 'Cost Basis', 
  'Current Price', 'Market Value',
  'Realized P&L (SGD)', 'Unrealized P&L (SGD)', 'Total P&L (SGD)'
];
const portfolioData = [portfolioHeader];

// Sort: open positions first
const sortedPositions = Array.from(positions.entries()).sort((a, b) => {
  const aOpen = (a[1].buyQty - a[1].sellQty) > 0.001;
  const bOpen = (b[1].buyQty - b[1].sellQty) > 0.001;
  if (aOpen && !bOpen) return -1;
  if (!aOpen && bOpen) return 1;
  return 0;
});

let rowNum = 2;
for (const [symbol, pos] of sortedPositions) {
  const currentQty = pos.buyQty - pos.sellQty;
  const isOpen = currentQty > 0.001;
  const avgCost = pos.buyQty > 0 ? pos.buyCost / pos.buyQty : 0;
  const costBasis = avgCost * currentQty;
  
  // Get IBKR's pre-calculated SGD P&L
  const pnl = pnlSummary.get(symbol) || { realizedTotal: 0, unrealizedTotal: 0, totalPnL: 0 };
  
  // Google Finance ticker
  let gsSymbol = symbol;
  if (pos.currency === 'HKD' && !symbol.includes('.')) gsSymbol = symbol + '.HK';
  
  portfolioData.push([
    symbol,
    pos.currency,
    isOpen ? 'OPEN' : 'CLOSED',
    Math.round(currentQty * 100) / 100,
    Math.round(avgCost * 100) / 100,
    Math.round(costBasis * 100) / 100,
    isOpen ? `=IFERROR(GOOGLEFINANCE("${gsSymbol}","price"),E${rowNum})` : 0,
    isOpen ? `=D${rowNum}*G${rowNum}` : 0,
    Math.round(pnl.realizedTotal * 100) / 100,  // From IBKR, already in SGD
    Math.round(pnl.unrealizedTotal * 100) / 100,  // From IBKR, already in SGD
    Math.round(pnl.totalPnL * 100) / 100  // From IBKR, already in SGD
  ]);
  rowNum++;
}

const portfolioWS = XLSX.utils.aoa_to_sheet(portfolioData);
portfolioWS['!cols'] = [
  { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
  { wch: 12 }, { wch: 14 },
  { wch: 14 }, { wch: 14 },
  { wch: 16 }, { wch: 18 }, { wch: 16 }
];
XLSX.utils.book_append_sheet(wb, portfolioWS, 'Portfolio');

// 4. Summary Sheet
const totalRealized = Array.from(pnlSummary.values()).reduce((sum, p) => sum + p.realizedTotal, 0);
const totalUnrealized = Array.from(pnlSummary.values()).reduce((sum, p) => sum + p.unrealizedTotal, 0);
const totalPnL = Array.from(pnlSummary.values()).reduce((sum, p) => sum + p.totalPnL, 0);

const summaryData = [
  ['PORTFOLIO SUMMARY (SGD)', ''],
  ['', ''],
  ['Metric', 'Value (SGD)'],
  ['Total Realized P&L', Math.round(totalRealized * 100) / 100],
  ['Total Unrealized P&L', Math.round(totalUnrealized * 100) / 100],
  ['Total P&L', Math.round(totalPnL * 100) / 100],
  ['', ''],
  ['Positions', ''],
  ['Open', Array.from(positions.values()).filter(p => (p.buyQty - p.sellQty) > 0.001).length],
  ['Closed', Array.from(positions.values()).filter(p => (p.buyQty - p.sellQty) <= 0.001).length],
  ['', ''],
  ['NOTE:', ''],
  ['P&L values are from IBKR, calculated using', ''],
  ['historical FX rates at transaction time.', ''],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

// Write file
const outputPath = '/root/openclaw/claudius-inc/IBKR_Portfolio_SGD.xlsx';
XLSX.writeFile(wb, outputPath);
console.log(`\nCreated: ${outputPath}`);
console.log(`\nTotals (SGD):`);
console.log(`  Realized P&L: ${totalRealized.toFixed(2)}`);
console.log(`  Unrealized P&L: ${totalUnrealized.toFixed(2)}`);
console.log(`  Total P&L: ${totalPnL.toFixed(2)}`);
