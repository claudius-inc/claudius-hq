const XLSX = require('xlsx');
const fs = require('fs');

// Read and parse the CSV using xlsx library
const workbook = XLSX.readFile('/root/.openclaw/media/inbound/file_116---aaaf44cf-29f8-4df0-ab79-e3cdf727465f.csv');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const allData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// Find trades section
const trades = [];
let inTrades = false;
let tradeHeaders = [];

for (const row of allData) {
  if (row[0] === 'Trades' && row[1] === 'Header') {
    inTrades = true;
    tradeHeaders = row.slice(2);
    continue;
  }
  
  if (row[0] === 'Trades' && row[1] === 'Data' && row[2] === 'Order') {
    // This is a trade row
    const assetCategory = row[3];
    const currency = row[4];
    const symbol = row[5];
    
    // Skip forex trades
    if (assetCategory !== 'Stocks') continue;
    const dateTime = row[6];
    const qty = parseFloat(String(row[7]).replace(/,/g, ''));
    const price = parseFloat(row[8]);
    const commission = Math.abs(parseFloat(row[11]) || 0);
    const realizedPL = parseFloat(row[13]) || 0;
    
    if (!isNaN(qty) && !isNaN(price)) {
      const date = String(dateTime).split(',')[0].trim();
      const action = qty > 0 ? 'BUY' : 'SELL';
      const absQty = Math.abs(qty);
      
      trades.push({
        date,
        symbol,
        action,
        qty: absQty,
        price,
        currency,
        commission,
        total: absQty * price + (action === 'BUY' ? commission : -commission),
        realizedPL
      });
    }
  }
  
  // Stop at next section
  if (inTrades && row[0] && row[0] !== 'Trades') {
    inTrades = false;
  }
}

console.log(`Parsed ${trades.length} trades`);

// Get unique symbols and calculate positions
const positions = new Map();
for (const trade of trades) {
  const symbolKey = String(trade.symbol);
  if (!positions.has(symbolKey)) {
    positions.set(symbolKey, {
      symbol: symbolKey,
      currency: trade.currency,
      buyQty: 0,
      sellQty: 0,
      buyCost: 0,
      sellProceeds: 0,
      realizedPL: 0
    });
  }
  const pos = positions.get(symbolKey);
  if (trade.action === 'BUY') {
    pos.buyQty += trade.qty;
    pos.buyCost += trade.total;
  } else {
    pos.sellQty += trade.qty;
    pos.sellProceeds += trade.total;
    pos.realizedPL += trade.realizedPL;
  }
}

// Create workbook
const wb = XLSX.utils.book_new();

// 1. Trades Sheet - populated with actual data
const tradesHeader = ['Date', 'Symbol', 'Action', 'Qty', 'Price', 'Currency', 'Commission', 'Total', 'Realized P/L'];
const tradesData = [tradesHeader];
for (const t of trades) {
  tradesData.push([t.date, t.symbol, t.action, t.qty, t.price, t.currency, t.commission, t.total, t.realizedPL]);
}
const tradesWS = XLSX.utils.aoa_to_sheet(tradesData);
tradesWS['!cols'] = [
  { wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 12 }
];
XLSX.utils.book_append_sheet(wb, tradesWS, 'Trades');

// 2. FX Rates Sheet
const fxData = [
  ['Currency', 'Rate to SGD', 'Formula (use in Google Sheets)'],
  ['USD', 1.35, '=GOOGLEFINANCE("CURRENCY:USDSGD")'],
  ['HKD', 0.17, '=GOOGLEFINANCE("CURRENCY:HKDSGD")'],
  ['JPY', 0.009, '=GOOGLEFINANCE("CURRENCY:JPYSGD")'],
  ['SGD', 1, '1'],
];
const fxWS = XLSX.utils.aoa_to_sheet(fxData);
XLSX.utils.book_append_sheet(wb, fxWS, 'FX Rates');

// 3. Portfolio Sheet - with formulas
const portfolioHeader = ['Symbol', 'Currency', 'Status', 'Shares', 'Avg Cost', 'Cost Basis', 'Current Price', 'Market Value', 'Unrealized P&L', 'P&L %', 'Realized P&L', 'Total P&L'];
const portfolioData = [portfolioHeader];

// Sort: open positions first, then closed
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
  
  // For Google Sheets, need ticker format
  let gsSymbol = String(symbol);
  if (pos.currency === 'HKD' && !gsSymbol.includes('.')) gsSymbol = gsSymbol + '.HK';
  
  portfolioData.push([
    symbol,
    pos.currency,
    isOpen ? 'OPEN' : 'CLOSED',
    Math.round(currentQty * 100) / 100,
    Math.round(avgCost * 100) / 100,
    Math.round(costBasis * 100) / 100,
    isOpen ? `=IFERROR(GOOGLEFINANCE("${gsSymbol}","price"),E${rowNum})` : 0,
    isOpen ? `=D${rowNum}*G${rowNum}` : 0,
    isOpen ? `=H${rowNum}-F${rowNum}` : 0,
    isOpen ? `=IF(F${rowNum}>0,I${rowNum}/F${rowNum},0)` : 0,
    Math.round(pos.realizedPL * 100) / 100,
    isOpen ? `=I${rowNum}+K${rowNum}` : Math.round(pos.realizedPL * 100) / 100
  ]);
  rowNum++;
}

const portfolioWS = XLSX.utils.aoa_to_sheet(portfolioData);
portfolioWS['!cols'] = [
  { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }
];
XLSX.utils.book_append_sheet(wb, portfolioWS, 'Portfolio');

// 4. Summary Sheet
const totalRealizedPL = Array.from(positions.values()).reduce((sum, p) => sum + p.realizedPL, 0);
const openCount = Array.from(positions.values()).filter(p => (p.buyQty - p.sellQty) > 0.001).length;
const closedCount = positions.size - openCount;

const summaryData = [
  ['PORTFOLIO SUMMARY', '', ''],
  ['', '', ''],
  ['Total Trades', trades.length, ''],
  ['Unique Tickers', positions.size, ''],
  ['Open Positions', openCount, ''],
  ['Closed Positions', closedCount, ''],
  ['', '', ''],
  ['REALIZED P&L (from closed trades)', '', ''],
  ['Total Realized P&L', Math.round(totalRealizedPL * 100) / 100, '(in original currencies)'],
  ['', '', ''],
  ['CURRENT POSITIONS', '', ''],
  ...Array.from(positions.entries())
    .filter(([_, p]) => (p.buyQty - p.sellQty) > 0.001)
    .map(([symbol, p]) => [symbol, Math.round(p.buyQty - p.sellQty), p.currency]),
  ['', '', ''],
  ['INSTRUCTIONS:', '', ''],
  ['1. In Google Sheets: FX Rates sheet - copy column C formulas to column B', '', ''],
  ['2. Portfolio prices will auto-update via GOOGLEFINANCE', '', ''],
  ['3. Add conditional formatting: Status="CLOSED" → grey row', '', ''],
];
const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
XLSX.utils.book_append_sheet(wb, summaryWS, 'Summary');

// Write file
const outputPath = '/root/openclaw/claudius-inc/IBKR_Portfolio_MrZ.xlsx';
XLSX.writeFile(wb, outputPath);
console.log(`\nCreated: ${outputPath}`);
console.log(`\nPositions:`);
for (const [symbol, pos] of sortedPositions) {
  const qty = pos.buyQty - pos.sellQty;
  const status = qty > 0.001 ? 'OPEN' : 'CLOSED';
  console.log(`  ${symbol} (${pos.currency}): ${Math.round(qty)} shares [${status}], Realized P&L: ${pos.realizedPL.toFixed(2)}`);
}
