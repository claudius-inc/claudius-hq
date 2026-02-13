/**
 * IBKR Activity Statement Parser
 * Parses Excel exports from Interactive Brokers
 */

import * as XLSX from 'xlsx';

export interface IBKRTrade {
  tradeDate: string;
  settleDate: string | null;
  symbol: string;
  description: string;
  assetClass: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  currency: string;
  fxRate: number;
  proceeds: number | null;
  costBasis: number | null;
  realizedPnl: number | null;
  commission: number;
  fees: number;
}

export interface IBKRIncome {
  date: string;
  symbol: string;
  description: string;
  incomeType: 'DIVIDEND' | 'INTEREST' | 'OTHER';
  amount: number;
  currency: string;
  fxRate: number;
}

export interface IBKRFXRate {
  date: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
}

export interface IBKRParseResult {
  statementStart: string | null;
  statementEnd: string | null;
  trades: IBKRTrade[];
  income: IBKRIncome[];
  fxRates: IBKRFXRate[];
  errors: string[];
}

/**
 * Parse IBKR Activity Statement Excel file
 */
export function parseIBKRStatement(buffer: Buffer): IBKRParseResult {
  const result: IBKRParseResult = {
    statementStart: null,
    statementEnd: null,
    trades: [],
    income: [],
    fxRates: [],
    errors: [],
  };

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    
    // IBKR typically has one sheet or multiple sections
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { 
        header: 1,
        raw: false,
        dateNF: 'yyyy-mm-dd'
      }) as unknown[][];

      // Parse the multi-section IBKR format
      parseIBKRSections(data, result);
    }
  } catch (err) {
    result.errors.push(`Failed to parse Excel file: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Parse IBKR's multi-section CSV/Excel format
 * IBKR files have sections like "Trades", "Dividends", "Interest", etc.
 */
function parseIBKRSections(data: unknown[][], result: IBKRParseResult) {
  let currentSection = '';
  let headerRow: string[] = [];

  for (const row of data) {
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || '').trim();
    const secondCell = String(row[1] || '').trim();

    // Detect section headers (IBKR format: "Trades,Header" or "Trades,Data")
    if (firstCell === 'Trades' && secondCell === 'Header') {
      currentSection = 'trades';
      headerRow = row.slice(2).map(c => String(c || '').trim().toLowerCase());
      continue;
    }
    if (firstCell === 'Trades' && secondCell === 'Data') {
      if (currentSection === 'trades') {
        parseTradeLine(row.slice(2), headerRow, result);
      }
      continue;
    }

    // Dividends section
    if (firstCell === 'Dividends' && secondCell === 'Header') {
      currentSection = 'dividends';
      headerRow = row.slice(2).map(c => String(c || '').trim().toLowerCase());
      continue;
    }
    if (firstCell === 'Dividends' && secondCell === 'Data') {
      if (currentSection === 'dividends') {
        parseIncomeLine(row.slice(2), headerRow, 'DIVIDEND', result);
      }
      continue;
    }

    // Interest section
    if (firstCell === 'Interest' && secondCell === 'Header') {
      currentSection = 'interest';
      headerRow = row.slice(2).map(c => String(c || '').trim().toLowerCase());
      continue;
    }
    if (firstCell === 'Interest' && secondCell === 'Data') {
      if (currentSection === 'interest') {
        parseIncomeLine(row.slice(2), headerRow, 'INTEREST', result);
      }
      continue;
    }

    // Statement date range
    if (firstCell === 'Statement' && secondCell === 'Header') {
      currentSection = 'statement';
      headerRow = row.slice(2).map(c => String(c || '').trim().toLowerCase());
      continue;
    }
    if (firstCell === 'Statement' && secondCell === 'Data') {
      parseStatementInfo(row.slice(2), headerRow, result);
      continue;
    }

    // FX Rates / Mark-to-Market section for exchange rates
    if (firstCell.includes('Exchange Rate') || firstCell.includes('Forex')) {
      // Skip for now, will implement if needed
      continue;
    }
  }
}

function parseTradeLine(row: unknown[], headers: string[], result: IBKRParseResult) {
  const getVal = (name: string): string => {
    const idx = headers.findIndex(h => h.includes(name));
    return idx >= 0 ? String(row[idx] || '').trim() : '';
  };

  const getNum = (name: string): number => {
    const val = getVal(name);
    return parseFloat(val.replace(/,/g, '')) || 0;
  };

  const symbol = getVal('symbol');
  const dateStr = getVal('date/time') || getVal('date');
  
  if (!symbol || !dateStr) return;

  // Parse date (IBKR uses various formats)
  const tradeDate = parseIBKRDate(dateStr);
  if (!tradeDate) {
    result.errors.push(`Invalid trade date: ${dateStr}`);
    return;
  }

  const quantity = getNum('quantity');
  const action = quantity >= 0 ? 'BUY' : 'SELL';
  const absQuantity = Math.abs(quantity);

  const trade: IBKRTrade = {
    tradeDate,
    settleDate: parseIBKRDate(getVal('settle date')) || null,
    symbol: normalizeSymbol(symbol),
    description: getVal('description'),
    assetClass: getVal('asset class') || getVal('asset category') || 'STK',
    action,
    quantity: absQuantity,
    price: getNum('price'),
    currency: getVal('currency') || 'USD',
    fxRate: getNum('fx rate') || getNum('rate') || 1,
    proceeds: getNum('proceeds') || null,
    costBasis: getNum('basis') || getNum('cost basis') || null,
    realizedPnl: getNum('realized p/l') || getNum('realized p&l') || null,
    commission: Math.abs(getNum('comm/fee') || getNum('commission')),
    fees: Math.abs(getNum('fee') || getNum('fees')),
  };

  result.trades.push(trade);
}

function parseIncomeLine(row: unknown[], headers: string[], incomeType: 'DIVIDEND' | 'INTEREST', result: IBKRParseResult) {
  const getVal = (name: string): string => {
    const idx = headers.findIndex(h => h.includes(name));
    return idx >= 0 ? String(row[idx] || '').trim() : '';
  };

  const getNum = (name: string): number => {
    const val = getVal(name);
    return parseFloat(val.replace(/,/g, '')) || 0;
  };

  const dateStr = getVal('date');
  const symbol = getVal('symbol');
  const amount = getNum('amount') || getNum('total');

  if (!dateStr || !amount) return;

  const date = parseIBKRDate(dateStr);
  if (!date) {
    result.errors.push(`Invalid income date: ${dateStr}`);
    return;
  }

  const income: IBKRIncome = {
    date,
    symbol: normalizeSymbol(symbol) || 'CASH',
    description: getVal('description'),
    incomeType,
    amount,
    currency: getVal('currency') || 'USD',
    fxRate: getNum('fx rate') || getNum('rate') || 1,
  };

  result.income.push(income);
}

function parseStatementInfo(row: unknown[], headers: string[], result: IBKRParseResult) {
  const getVal = (name: string): string => {
    const idx = headers.findIndex(h => h.includes(name));
    return idx >= 0 ? String(row[idx] || '').trim() : '';
  };

  const fromDate = getVal('from date') || getVal('start date') || getVal('period');
  const toDate = getVal('to date') || getVal('end date');

  if (fromDate) {
    result.statementStart = parseIBKRDate(fromDate) || fromDate;
  }
  if (toDate) {
    result.statementEnd = parseIBKRDate(toDate) || toDate;
  }
}

/**
 * Parse IBKR date formats: "2024-01-15" or "2024-01-15, 09:30:00" or "January 15, 2024"
 */
function parseIBKRDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // Remove time portion if present
  const cleaned = dateStr.split(',')[0].trim();
  
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.substring(0, 10);
  }

  // Try parsing with Date
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().substring(0, 10);
  }

  return null;
}

/**
 * Normalize stock symbols (remove exchange suffixes for consistency)
 */
function normalizeSymbol(symbol: string): string {
  // IBKR sometimes includes exchange info like "AAPL.NASDAQ"
  return symbol.split('.')[0].trim().toUpperCase();
}

/**
 * Calculate current positions from trade history
 */
export function calculatePositions(trades: IBKRTrade[]): Map<string, { quantity: number; avgCost: number; totalCost: number; realizedPnl: number; currency: string }> {
  const positions = new Map<string, { quantity: number; totalCost: number; realizedPnl: number; currency: string }>();

  // Sort trades by date
  const sortedTrades = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

  for (const trade of sortedTrades) {
    const current = positions.get(trade.symbol) || { 
      quantity: 0, 
      totalCost: 0, 
      realizedPnl: 0, 
      currency: trade.currency 
    };

    if (trade.action === 'BUY') {
      // Add to position
      current.totalCost += trade.quantity * trade.price + trade.commission + trade.fees;
      current.quantity += trade.quantity;
    } else {
      // Sell - realize P&L
      if (current.quantity > 0) {
        const avgCost = current.totalCost / current.quantity;
        const soldQuantity = Math.min(trade.quantity, current.quantity);
        const costOfSold = avgCost * soldQuantity;
        const proceedsFromSale = soldQuantity * trade.price - trade.commission - trade.fees;
        
        current.realizedPnl += proceedsFromSale - costOfSold;
        current.totalCost -= costOfSold;
        current.quantity -= soldQuantity;
      }
    }

    if (trade.realizedPnl !== null) {
      // Use IBKR's realized P&L if available (more accurate)
      current.realizedPnl = trade.realizedPnl;
    }

    positions.set(trade.symbol, current);
  }

  // Calculate average cost
  const result = new Map<string, { quantity: number; avgCost: number; totalCost: number; realizedPnl: number; currency: string }>();
  for (const [symbol, pos] of Array.from(positions.entries())) {
    if (pos.quantity > 0.0001) { // Only keep positions with shares
      result.set(symbol, {
        ...pos,
        avgCost: pos.totalCost / pos.quantity,
      });
    }
  }

  return result;
}
