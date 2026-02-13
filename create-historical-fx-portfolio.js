const XLSX = require('xlsx');
const fs = require('fs');

// Read raw CSV to preserve date strings
const csvContent = fs.readFileSync('/root/.openclaw/media/inbound/file_116---aaaf44cf-29f8-4df0-ab79-e3cdf727465f.csv', 'utf-8');
const lines = csvContent.split('\n');

// Parse forex trades to build FX rate lookup by date
const fxRates = new Map(); // key: "HKD:2026-01-20" -> [rates]

for (const line of lines) {
  if (line.startsWith('Trades,Data,Order,Forex,')) {
    // Parse: Trades,Data,Order,Forex,HKD,SGD.HKD,"2026-01-20, 20:53:11",-9,6.07482,...
    const parts = line.split(',');
    const currency = parts[4];
    const symbol = parts[5];
    
    // Find the date in quotes
    const dateMatch = line.match(/"(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const date = dateMatch[1];
    
    // Find price (after the date/time)
    const afterDate = line.split('",')[1];
    if (!afterDate) continue;
    const priceParts = afterDate.split(',');
    const price = parseFloat(priceParts[1]);
    
    if (isNaN(price)) continue;
    
    // Calculate rate to SGD
    let rateToSGD = 0;
    if (symbol === 'SGD.HKD') {
      rateToSGD = 1 / price;
      const key = `HKD:${date}`;
      if (!fxRates.has(key)) fxRates.set(key, []);
      fxRates.get(key).push(rateToSGD);
    } else if (symbol === 'USD.SGD') {
      rateToSGD = price;
      const key = `USD:${date}`;
      if (!fxRates.has(key)) fxRates.set(key, []);
      fxRates.get(key).push(rateToSGD);
    } else if (symbol === 'SGD.JPY') {
      rateToSGD = 1 / price;
      const key = `JPY:${date}`;
      if (!fxRates.has(key)) fxRates.set(key, []);
      fxRates.get(key).push(rateToSGD);
    }
  }
}

// Average the rates for each date
const avgFxRates = new Map();
for (const [key, rates] of fxRates) {
  avgFxRates.set(key, rates.reduce((a, b) => a + b, 0) / rates.length);
}

console.log('Historical FX Rates (avg per day):');
for (const [key, rate] of avgFxRates) {
  console.log(`  ${key}: ${rate.toFixed(6)}`);
}

// Parse stock trades
const trades = [];
for (const line of lines) {
  if (line.startsWith('Trades,Data,Order,Stocks,')) {
    const parts = line.split(',');
    const currency = parts[4];
    const symbol = parts[5];
    
    // Find date
    const dateMatch = line.match(/"(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const date = dateMatch[1];
    
    // Parse qty and price after the date
    const afterDate = line.split('",')[1];
    if (!afterDate) continue;
    const valueParts = afterDate.split(',');
    
    // Handle quoted negative numbers like "-3,000"
    let qtyStr = valueParts[0];
    let priceIdx = 1;
    if (qtyStr.startsWith('"')) {
      qtyStr = qtyStr.replace(/"/g, '') + valueParts[1].replace(/"/g, '');
      priceIdx = 2;
    }
    
    const qty = parseFloat(qtyStr.replace(/,/g, ''));
    const price = parseFloat(valueParts[priceIdx]);
    const commission = Math.abs(parseFloat(valueParts[priceIdx + 3]) || 0);
    
    if (isNaN(qty) || isNaN(price)) continue;
    
    const action = qty > 0 ? 'BUY' : 'SELL';
    const absQty = Math.abs(qty);
    const total = absQty * price + (action === 'BUY' ? commission : -commission);
    
    // Get historical FX rate
    let fxRate = 1;
    if (currency !== 'SGD') {
      const key = `${currency}:${date}`;
      fxRate = avgFxRates.get(key) || (currency === 'HKD' ? 0.165 : currency === 'USD' ? 1.27 : 0.0082);
    }
    
    trades.push({
      date, symbol, action,
      qty: absQty,
      price, currency, commission,
      total,
      fxRate,
      totalSGD: total * fxRate
    });
  }
}

console.log(`\nParsed ${trades.length} stock trades`);

// Create workbook
const wb = XLSX.utils.book_new();

// 1. Trades Sheet with FX Rate column
const tradesHeader = ['Date', 'Symbol', 'Action', 'Qty', 'Price', 'Currency', 'Commission', 'Total (Local)', 'FX Rate', 'Total (SGD)'];
const tradesData = [tradesHeader];
for (const t of trades) {
  tradesData.push([
    t.date, t.symbol, t.action, t.qty, t.price, t.currency, t.commission,
    Math.round(t.total * 100) / 100,
    Math.round(t.fxRate * 1000000) / 1000000,
    Math.round(t.totalSGD * 100) / 100
  ]);
}
const tradesWS = XLSX.utils.aoa_to_sheet(tradesData);
tradesWS['!cols'] = [
  { wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 8 }, { wch: 10 }, 
  { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }
];
XLSX.utils.book_append_sheet(wb, tradesWS, 'Trades');

// 2. FX Rates (for live prices only)
const fxData = [
  ['Currency', 'Rate to SGD', 'Formula (Google Sheets)'],
  ['USD', 1.35, '=GOOGLEFINANCE("CURRENCY:USDSGD")'],
  ['HKD', 0.165, '=GOOGLEFINANCE("CURRENCY:HKDSGD")'],
  ['JPY', 0.009, '=GOOGLEFINANCE("CURRENCY:JPYSGD")'],
  ['SGD', 1, '1'],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fxData), 'FX Rates');

// 3. Portfolio Sheet with formulas
const portfolioHeader = [
  'Symbol', 'Currency', 'Status', 'Shares', 
  'Avg Cost (SGD)', 'Cost Basis (SGD)', 
  'Current Price', 'Market Value (SGD)',
  'Realized P&L (SGD)', 'Unrealized P&L (SGD)', 'Total P&L (SGD)'
];
const portfolioData = [portfolioHeader];

// Get unique symbols and calculate positions
const symbols = [...new Set(trades.map(t => t.symbol))];
const symbolCurrency = new Map();
const positionQty = new Map();

for (const t of trades) {
  symbolCurrency.set(t.symbol, t.currency);
  const curr = positionQty.get(t.symbol) || 0;
  positionQty.set(t.symbol, curr + (t.action === 'BUY' ? t.qty : -t.qty));
}

// Sort: open positions first
const sortedSymbols = symbols.sort((a, b) => {
  const aOpen = positionQty.get(a) > 0.001;
  const bOpen = positionQty.get(b) > 0.001;
  if (aOpen && !bOpen) return -1;
  if (!aOpen && bOpen) return 1;
  return 0;
});

let rowNum = 2;
for (const symbol of sortedSymbols) {
  const currency = symbolCurrency.get(symbol);
  const currentQty = positionQty.get(symbol);
  const isOpen = currentQty > 0.001;
  
  // Google Finance ticker
  let gsSymbol = symbol;
  if (currency === 'HKD' && !symbol.includes('.')) gsSymbol = symbol + '.HK';
  
  // All formulas reference Trades sheet column J (Total SGD)
  const sharesF = `=SUMIFS(Trades!$D:$D,Trades!$B:$B,A${rowNum},Trades!$C:$C,"BUY")-SUMIFS(Trades!$D:$D,Trades!$B:$B,A${rowNum},Trades!$C:$C,"SELL")`;
  const buyQtyF = `SUMIFS(Trades!$D:$D,Trades!$B:$B,A${rowNum},Trades!$C:$C,"BUY")`;
  const buyCostF = `SUMIFS(Trades!$J:$J,Trades!$B:$B,A${rowNum},Trades!$C:$C,"BUY")`;
  const costBasisF = `=IF(D${rowNum}>0,${buyCostF}*D${rowNum}/${buyQtyF},0)`;
  const avgCostF = `=IF(D${rowNum}>0,F${rowNum}/D${rowNum},0)`;
  const priceF = isOpen ? `=IFERROR(GOOGLEFINANCE("${gsSymbol}","price"),0)` : '0';
  const mktValF = isOpen ? `=D${rowNum}*G${rowNum}*VLOOKUP(B${rowNum},'FX Rates'!$A:$B,2,FALSE)` : '0';
  
  // Realized = Sell proceeds - Cost of sold shares (all in SGD)
  const sellQtyF = `SUMIFS(Trades!$D:$D,Trades!$B:$B,A${rowNum},Trades!$C:$C,"SELL")`;
  const sellProcF = `SUMIFS(Trades!$J:$J,Trades!$B:$B,A${rowNum},Trades!$C:$C,"SELL")`;
  const realizedF = `=IF(${sellQtyF}>0,${sellProcF}-${buyCostF}*${sellQtyF}/${buyQtyF},0)`;
  
  const unrealizedF = isOpen ? `=H${rowNum}-F${rowNum}` : '0';
  const totalF = `=I${rowNum}+J${rowNum}`;
  
  portfolioData.push([
    symbol, currency,
    isOpen ? 'OPEN' : 'CLOSED',
    sharesF, avgCostF, costBasisF, priceF, mktValF,
    realizedF, unrealizedF, totalF
  ]);
  rowNum++;
}

const portfolioWS = XLSX.utils.aoa_to_sheet(portfolioData);
portfolioWS['!cols'] = [
  { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
  { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
  { wch: 16 }, { wch: 18 }, { wch: 16 }
];
XLSX.utils.book_append_sheet(wb, portfolioWS, 'Portfolio');

// 4. Summary
const summaryData = [
  ['PORTFOLIO SUMMARY', ''],
  ['', ''],
  ['All P&L in SGD using historical FX rates at transaction time', ''],
  ['', ''],
  ['Total Realized P&L (SGD)', `=SUM(Portfolio!I:I)`],
  ['Total Unrealized P&L (SGD)', `=SUM(Portfolio!J:J)`],
  ['Total P&L (SGD)', `=SUM(Portfolio!K:K)`],
  ['', ''],
  ['Open Positions', `=COUNTIF(Portfolio!C:C,"OPEN")`],
  ['Closed Positions', `=COUNTIF(Portfolio!C:C,"CLOSED")`],
  ['', ''],
  ['HOW IT WORKS:', ''],
  ['1. Trades sheet has FX rate at each transaction date', ''],
  ['2. Column J = Total in SGD (using historical FX)', ''],
  ['3. Portfolio formulas reference Trades!J', ''],
  ['4. Add new trades → Portfolio auto-updates', ''],
  ['', ''],
  ['TO ADD NEW TRADES:', ''],
  ['1. Add row to Trades sheet with Date, Symbol, etc.', ''],
  ['2. Look up FX rate for that date and enter in column I', ''],
  ['3. Column J formula: =H*I (Total Local × FX Rate)', ''],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

// Write file
const outputPath = '/root/openclaw/claudius-inc/IBKR_Portfolio_Historical_FX.xlsx';
XLSX.writeFile(wb, outputPath);
console.log(`\nCreated: ${outputPath}`);

// Show some trades for verification
console.log('\nSample trades with FX:');
for (const t of trades.slice(0, 5)) {
  console.log(`  ${t.date} ${t.symbol} ${t.action} ${t.qty} @ ${t.price} ${t.currency} | FX=${t.fxRate.toFixed(4)} | SGD=${t.totalSGD.toFixed(2)}`);
}
