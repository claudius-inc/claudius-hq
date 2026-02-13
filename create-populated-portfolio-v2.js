const XLSX = require('xlsx');
const { createClient } = require('@libsql/client');

// Load env
require('dotenv').config({ path: './.env.local' });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function createPopulatedPortfolio() {
  // Fetch all trades
  const tradesResult = await client.execute('SELECT * FROM ibkr_trades ORDER BY trade_date ASC');
  console.log('Fetched', tradesResult.rows.length, 'trades');
  
  const wb = XLSX.utils.book_new();
  
  // === TRADES SHEET with actual data ===
  const tradesHeaders = [
    'Date', 'Symbol', 'Action', 'Quantity', 'Price', 'Currency', 
    'Commission', 'FX Rate (to SGD)', 'Total (Native)', 'Total (SGD)',
    'Signed Qty', 'Running Sum', 'Lot', 'Position ID'
  ];
  
  const tradesData = [tradesHeaders];
  
  for (let i = 0; i < tradesResult.rows.length; i++) {
    const t = tradesResult.rows[i];
    const qty = Number(t.quantity);
    const price = Number(t.price);
    const comm = Math.abs(Number(t.commission || 0));
    const fxRate = Number(t.fx_rate || 1);
    const action = t.action;
    
    // Calculate native total (positive for buys = cost, negative for sells = proceeds)
    const nativeTotal = action === 'BUY' 
      ? (qty * price + comm)
      : -(qty * price - comm);
    
    const row = i + 2; // Excel row (1-indexed, header is row 1)
    tradesData.push([
      t.trade_date,
      t.symbol,
      action,
      qty,
      price,
      t.currency,
      comm,
      fxRate,
      nativeTotal,
      nativeTotal * fxRate,
      // K: Signed Qty (positive for BUY, negative for SELL)
      `=IF(C${row}="BUY",D${row},-D${row})`,
      // L: Running Sum (cumulative position for this symbol)
      `=SUMPRODUCT(($B$2:B${row}=B${row})*($K$2:K${row}))`,
      // M: Lot Number (1 + count of times running sum was 0 before)
      row === 2 ? '1' : `=1+SUMPRODUCT(($B$2:B${row-1}=B${row})*($L$2:L${row-1}=0))`,
      // N: Position ID (Symbol-Lot)
      `=B${row}&"-"&M${row}`
    ]);
  }
  
  const tradesSheet = XLSX.utils.aoa_to_sheet(tradesData);
  tradesSheet['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    { wch: 10 }, { wch: 12 }, { wch: 6 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, tradesSheet, 'Trades');
  
  // === PORTFOLIO SHEET with UNIQUE() formula ===
  const portfolioHeaders = [
    'Symbol', 'Currency', 'Yahoo Symbol', 'Net Qty', 'Total Cost (Native)', 'Total Cost (SGD)', 
    'Avg Cost', 'Current Price', 'Market Value (Native)', 'Market Value (SGD)',
    'Unrealized P&L (SGD)', 'P&L %'
  ];
  
  const portfolioData = [portfolioHeaders];
  
  // Count unique symbols for sizing (but use UNIQUE formula in Excel)
  const uniqueSymbols = [...new Set(tradesResult.rows.map(t => t.symbol))];
  console.log('Unique symbols:', uniqueSymbols.length, uniqueSymbols);
  
  // Yahoo Symbol formula: appends exchange suffix based on currency
  // HKD → .HK, JPY → .T, SGD → .SI, GBP → .L, EUR → .DE, AUD → .AX, CAD → .TO, USD → no suffix
  const yahooSymbolFormula = (row) => 
    `=IF(A${row}="","",A${row}&IFERROR(VLOOKUP(B${row},ExchangeSuffix!$A:$B,2,FALSE),""))`;
  
  // Row 2: Use UNIQUE() to get symbols, and formulas for everything else
  portfolioData.push([
    // A2: UNIQUE symbols from Trades column B
    '=UNIQUE(Trades!$B$2:$B$1000)',
    // B2: Lookup currency for each symbol
    '=IFERROR(XLOOKUP(A2,Trades!$B:$B,Trades!$F:$F),"")',
    // C2: Yahoo Symbol with exchange suffix
    yahooSymbolFormula(2),
    // D2: Net Qty
    '=IF(A2="","",SUMIFS(Trades!$D:$D,Trades!$B:$B,A2,Trades!$C:$C,"BUY")-SUMIFS(Trades!$D:$D,Trades!$B:$B,A2,Trades!$C:$C,"SELL"))',
    // E2: Total Cost (Native)
    '=IF(A2="","",SUMIFS(Trades!$I:$I,Trades!$B:$B,A2,Trades!$C:$C,"BUY"))',
    // F2: Total Cost (SGD)
    '=IF(A2="","",SUMIFS(Trades!$J:$J,Trades!$B:$B,A2,Trades!$C:$C,"BUY"))',
    // G2: Avg Cost
    '=IF(OR(A2="",D2=0),"",E2/D2)',
    // H2: Current Price (manual entry)
    '',
    // I2: Market Value (Native)
    '=IF(OR(A2="",H2=""),"",D2*H2)',
    // J2: Market Value (SGD)
    '=IF(OR(A2="",I2=""),"",I2*IFERROR(VLOOKUP(B2,FXRates!$A:$B,2,FALSE),1))',
    // K2: Unrealized P&L
    '=IF(OR(A2="",J2=""),"",J2-F2)',
    // L2: P&L %
    '=IF(OR(A2="",F2=0,K2=""),"",K2/F2)'
  ]);
  
  // Add formula rows for remaining positions
  for (let row = 3; row <= 30; row++) {
    portfolioData.push([
      '', // A: Will be filled by UNIQUE spill
      `=IFERROR(XLOOKUP(A${row},Trades!$B:$B,Trades!$F:$F),"")`,
      yahooSymbolFormula(row),
      `=IF(A${row}="","",SUMIFS(Trades!$D:$D,Trades!$B:$B,A${row},Trades!$C:$C,"BUY")-SUMIFS(Trades!$D:$D,Trades!$B:$B,A${row},Trades!$C:$C,"SELL"))`,
      `=IF(A${row}="","",SUMIFS(Trades!$I:$I,Trades!$B:$B,A${row},Trades!$C:$C,"BUY"))`,
      `=IF(A${row}="","",SUMIFS(Trades!$J:$J,Trades!$B:$B,A${row},Trades!$C:$C,"BUY"))`,
      `=IF(OR(A${row}="",D${row}=0),"",E${row}/D${row})`,
      '',
      `=IF(OR(A${row}="",H${row}=""),"",D${row}*H${row})`,
      `=IF(OR(A${row}="",I${row}=""),"",I${row}*IFERROR(VLOOKUP(B${row},FXRates!$A:$B,2,FALSE),1))`,
      `=IF(OR(A${row}="",J${row}=""),"",J${row}-F${row})`,
      `=IF(OR(A${row}="",F${row}=0,K${row}=""),"",K${row}/F${row})`
    ]);
  }
  
  // Totals row at row 32
  portfolioData.push([
    'TOTAL', '', '', '', '',
    '=SUMIF(F2:F30,"<>")',
    '', '', '',
    '=SUMIF(J2:J30,"<>")',
    '=SUMIF(K2:K30,"<>")',
    '=IF(F32<>0,K32/F32,"")'
  ]);
  
  const portfolioSheet = XLSX.utils.aoa_to_sheet(portfolioData);
  portfolioSheet['!cols'] = [
    { wch: 10 }, // Symbol
    { wch: 10 }, // Currency
    { wch: 14 }, // Yahoo Symbol
    { wch: 10 }, // Net Qty
    { wch: 18 }, // Total Cost Native
    { wch: 18 }, // Total Cost SGD
    { wch: 12 }, // Avg Cost
    { wch: 14 }, // Current Price
    { wch: 18 }, // Market Value Native
    { wch: 18 }, // Market Value SGD
    { wch: 18 }, // Unrealized P&L
    { wch: 10 }, // P&L %
  ];
  XLSX.utils.book_append_sheet(wb, portfolioSheet, 'Portfolio');
  
  // === REALIZED P&L SHEET with UNIQUE() ===
  const realizedHeaders = ['Symbol', 'Currency', 'Sell Proceeds (Native)', 'Sell Proceeds (SGD)', 'Notes'];
  const realizedData = [realizedHeaders];
  
  // Row 2: UNIQUE formula + lookup formulas
  realizedData.push([
    '=UNIQUE(Trades!$B$2:$B$1000)',
    '=IFERROR(XLOOKUP(A2,Trades!$B:$B,Trades!$F:$F),"")',
    '=IF(A2="","",SUMIFS(Trades!$I:$I,Trades!$B:$B,A2,Trades!$C:$C,"SELL"))',
    '=IF(A2="","",SUMIFS(Trades!$J:$J,Trades!$B:$B,A2,Trades!$C:$C,"SELL"))',
    'Negative = cash received'
  ]);
  
  // Add formula rows for spill
  for (let row = 3; row <= 30; row++) {
    realizedData.push([
      '',
      `=IFERROR(XLOOKUP(A${row},Trades!$B:$B,Trades!$F:$F),"")`,
      `=IF(A${row}="","",SUMIFS(Trades!$I:$I,Trades!$B:$B,A${row},Trades!$C:$C,"SELL"))`,
      `=IF(A${row}="","",SUMIFS(Trades!$J:$J,Trades!$B:$B,A${row},Trades!$C:$C,"SELL"))`,
      ''
    ]);
  }
  
  realizedData.push(['TOTAL', '', 
    '=SUMIF(C2:C30,"<>")',
    '=SUMIF(D2:D30,"<>")',
    ''
  ]);
  
  const realizedSheet = XLSX.utils.aoa_to_sheet(realizedData);
  realizedSheet['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, realizedSheet, 'Realized PnL');
  
  // === EXCHANGE SUFFIX SHEET (for Yahoo Finance symbols) ===
  const exchangeData = [
    ['Currency', 'Suffix', 'Exchange', 'Example'],
    ['HKD', '.HK', 'Hong Kong', '9988.HK'],
    ['JPY', '.T', 'Tokyo', '7203.T'],
    ['SGD', '.SI', 'Singapore', 'D05.SI'],
    ['GBP', '.L', 'London', 'HSBA.L'],
    ['EUR', '.DE', 'Germany (Xetra)', 'SAP.DE'],
    ['AUD', '.AX', 'Australia', 'BHP.AX'],
    ['CAD', '.TO', 'Toronto', 'RY.TO'],
    ['CNY', '.SS', 'Shanghai', '600519.SS'],
    ['KRW', '.KS', 'Korea', '005930.KS'],
    ['TWD', '.TW', 'Taiwan', '2330.TW'],
    ['USD', '', 'US (no suffix)', 'AAPL'],
  ];
  const exchangeSheet = XLSX.utils.aoa_to_sheet(exchangeData);
  exchangeSheet['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, exchangeSheet, 'ExchangeSuffix');
  
  // === FX RATES SHEET ===
  const fxData = [
    ['Currency', 'Rate to SGD', 'Notes'],
    ['USD', 1.26, 'Update with current rate'],
    ['HKD', 0.162, 'Update with current rate'],
    ['JPY', 0.0082, 'Update with current rate'],
    ['SGD', 1, 'Base currency'],
    ['GBP', 1.70, 'Update with current rate'],
    ['EUR', 1.45, 'Update with current rate'],
    ['AUD', 0.85, 'Update with current rate'],
    ['CAD', 0.95, 'Update with current rate'],
  ];
  const fxSheet = XLSX.utils.aoa_to_sheet(fxData);
  fxSheet['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, fxSheet, 'FXRates');
  
  // Write file
  const outputPath = '/root/openclaw/claudius-inc/IBKR_Portfolio_Populated.xlsx';
  XLSX.writeFile(wb, outputPath);
  console.log('Created:', outputPath);
}

createPopulatedPortfolio().catch(console.error);
