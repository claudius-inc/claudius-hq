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
  
  // === TRADES SHEET with auto-lot tracking ===
  const tradesHeaders = [
    'Date', 'Symbol', 'Action', 'Quantity', 'Price', 'Currency', 
    'Commission', 'FX Rate (to SGD)', 'Total (Native)', 'Total (SGD)',
    'Signed Qty', 'Running Sum', 'Lot', 'Position ID'
  ];
  
  const tradesData = [tradesHeaders];
  
  for (let i = 0; i < tradesResult.rows.length; i++) {
    const t = tradesResult.rows[i];
    const row = i + 2; // Excel row (1-indexed, header is row 1)
    const qty = Number(t.quantity);
    const price = Number(t.price);
    const comm = Math.abs(Number(t.commission || 0));
    const fxRate = Number(t.fx_rate || 1);
    const action = t.action;
    
    const nativeTotal = action === 'BUY' 
      ? (qty * price + comm)
      : -(qty * price - comm);
    
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
      // K: Signed Qty
      `=IF(C${row}="BUY",D${row},-D${row})`,
      // L: Running Sum (cumulative for this symbol)
      `=SUMPRODUCT(($B$2:B${row}=B${row})*($K$2:K${row}))`,
      // M: Lot Number
      row === 2 ? '1' : `=1+SUMPRODUCT(($B$2:B${row-1}=B${row})*($L$2:L${row-1}=0))`,
      // N: Position ID
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
  
  // === PORTFOLIO SHEET with UNIQUE() on Position ID ===
  const portfolioHeaders = [
    'Position ID', 'Symbol', 'Currency', 'Yahoo Symbol', 'Net Qty', 
    'Total Cost (Native)', 'Total Cost (SGD)', 'Avg Cost', 
    'Current Price', 'Market Value (Native)', 'Market Value (SGD)',
    'Unrealized P&L (SGD)', 'P&L %'
  ];
  
  const portfolioData = [portfolioHeaders];
  
  const uniqueSymbols = [...new Set(tradesResult.rows.map(t => t.symbol))];
  console.log('Unique symbols:', uniqueSymbols.length, uniqueSymbols);
  
  // Formula to extract symbol from Position ID (e.g., "NVDA-2" -> "NVDA")
  const extractSymbol = (row) => 
    `=IFERROR(LEFT(A${row},FIND("~",SUBSTITUTE(A${row},"-","~",LEN(A${row})-LEN(SUBSTITUTE(A${row},"-",""))))-1),A${row})`;
  
  // Yahoo Symbol formula
  const yahooSymbolFormula = (row) => 
    `=IF(A${row}="","",B${row}&IFERROR(VLOOKUP(C${row},ExchangeSuffix!$A:$B,2,FALSE),""))`;
  
  // Row 2: First data row with UNIQUE formula
  portfolioData.push([
    '=UNIQUE(Trades!$N$2:$N$1000)', // A2: UNIQUE Position IDs
    extractSymbol(2),                // B2: Symbol
    '=IFERROR(XLOOKUP(A2,Trades!$N:$N,Trades!$F:$F),"")', // C2: Currency
    yahooSymbolFormula(2),           // D2: Yahoo Symbol
    '=IF(A2="","",SUMIFS(Trades!$D:$D,Trades!$N:$N,A2,Trades!$C:$C,"BUY")-SUMIFS(Trades!$D:$D,Trades!$N:$N,A2,Trades!$C:$C,"SELL"))', // E2: Net Qty
    '=IF(A2="","",SUMIFS(Trades!$I:$I,Trades!$N:$N,A2,Trades!$C:$C,"BUY"))', // F2: Total Cost Native
    '=IF(A2="","",SUMIFS(Trades!$J:$J,Trades!$N:$N,A2,Trades!$C:$C,"BUY"))', // G2: Total Cost SGD
    '=IF(OR(A2="",E2=0),"",F2/E2)',  // H2: Avg Cost
    '',                               // I2: Current Price (manual)
    '=IF(OR(A2="",I2=""),"",E2*I2)', // J2: Market Value Native
    '=IF(OR(A2="",J2=""),"",J2*IFERROR(VLOOKUP(C2,FXRates!$A:$B,2,FALSE),1))', // K2: Market Value SGD
    '=IF(OR(A2="",K2=""),"",K2-G2)', // L2: Unrealized P&L
    '=IF(OR(A2="",G2=0,L2=""),"",L2/G2)' // M2: P&L %
  ]);
  
  // Add formula rows for remaining positions (spill from UNIQUE)
  for (let row = 3; row <= 50; row++) {
    portfolioData.push([
      '', // A: Filled by UNIQUE spill
      extractSymbol(row),
      `=IFERROR(XLOOKUP(A${row},Trades!$N:$N,Trades!$F:$F),"")`,
      yahooSymbolFormula(row),
      `=IF(A${row}="","",SUMIFS(Trades!$D:$D,Trades!$N:$N,A${row},Trades!$C:$C,"BUY")-SUMIFS(Trades!$D:$D,Trades!$N:$N,A${row},Trades!$C:$C,"SELL"))`,
      `=IF(A${row}="","",SUMIFS(Trades!$I:$I,Trades!$N:$N,A${row},Trades!$C:$C,"BUY"))`,
      `=IF(A${row}="","",SUMIFS(Trades!$J:$J,Trades!$N:$N,A${row},Trades!$C:$C,"BUY"))`,
      `=IF(OR(A${row}="",E${row}=0),"",F${row}/E${row})`,
      '',
      `=IF(OR(A${row}="",I${row}=""),"",E${row}*I${row})`,
      `=IF(OR(A${row}="",J${row}=""),"",J${row}*IFERROR(VLOOKUP(C${row},FXRates!$A:$B,2,FALSE),1))`,
      `=IF(OR(A${row}="",K${row}=""),"",K${row}-G${row})`,
      `=IF(OR(A${row}="",G${row}=0,L${row}=""),"",L${row}/G${row})`
    ]);
  }
  
  // Totals row
  portfolioData.push([
    'TOTAL', '', '', '', '', '',
    '=SUMIF(G2:G50,"<>")', '', '', '',
    '=SUMIF(K2:K50,"<>")',
    '=SUMIF(L2:L50,"<>")',
    '=IF(G52<>0,L52/G52,"")'
  ]);
  
  const portfolioSheet = XLSX.utils.aoa_to_sheet(portfolioData);
  portfolioSheet['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 },
    { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
    { wch: 18 }, { wch: 18 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, portfolioSheet, 'Portfolio');
  
  // === EXCHANGE SUFFIX SHEET ===
  const exchangeData = [
    ['Currency', 'Suffix', 'Exchange'],
    ['HKD', '.HK', 'Hong Kong'],
    ['JPY', '.T', 'Tokyo'],
    ['SGD', '.SI', 'Singapore'],
    ['GBP', '.L', 'London'],
    ['EUR', '.DE', 'Germany'],
    ['AUD', '.AX', 'Australia'],
    ['CAD', '.TO', 'Toronto'],
    ['CNY', '.SS', 'Shanghai'],
    ['USD', '', 'US (no suffix)'],
  ];
  const exchangeSheet = XLSX.utils.aoa_to_sheet(exchangeData);
  exchangeSheet['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, exchangeSheet, 'ExchangeSuffix');
  
  // === FX RATES SHEET ===
  const fxData = [
    ['Currency', 'Rate to SGD'],
    ['USD', 1.26],
    ['HKD', 0.162],
    ['JPY', 0.0082],
    ['SGD', 1],
    ['GBP', 1.70],
    ['EUR', 1.45],
  ];
  const fxSheet = XLSX.utils.aoa_to_sheet(fxData);
  fxSheet['!cols'] = [{ wch: 10 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, fxSheet, 'FXRates');
  
  // Write file
  const outputPath = '/root/openclaw/claudius-inc/IBKR_Portfolio_AutoLot.xlsx';
  XLSX.writeFile(wb, outputPath);
  console.log('Created:', outputPath);
}

createPopulatedPortfolio().catch(console.error);
