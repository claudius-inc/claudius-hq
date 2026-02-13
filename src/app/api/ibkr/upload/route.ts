import { NextRequest, NextResponse } from 'next/server';
import db, { ensureDB } from '@/lib/db';
import { parseIBKRStatement, calculatePositions } from '@/lib/ibkr-parser';
import { getHistoricalFxRates, getFxRateFromCache } from '@/lib/historical-fx';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await ensureDB();
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Parse the IBKR statement
    const parseResult = parseIBKRStatement(buffer);
    
    if (parseResult.errors.length > 0 && parseResult.trades.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to parse file',
        details: parseResult.errors 
      }, { status: 400 });
    }

    // Fetch historical FX rates for all trades
    const fxRequests = parseResult.trades
      .filter(t => t.currency !== 'SGD')
      .map(t => ({ currency: t.currency, date: t.tradeDate }));
    
    const historicalFxRates = await getHistoricalFxRates(fxRequests);
    
    // Update trades with correct FX rates (to SGD)
    for (const trade of parseResult.trades) {
      if (trade.currency !== 'SGD') {
        const rate = getFxRateFromCache(historicalFxRates, trade.currency, trade.tradeDate, 1);
        trade.fxRate = rate;  // Override IBKR's fxRate with our XXXSGD rate
      } else {
        trade.fxRate = 1;
      }
    }

    // Store historical FX rates in database
    for (const [key, rate] of Array.from(historicalFxRates.entries())) {
      const [currency, date] = key.split(':');
      try {
        await db.execute({
          sql: `INSERT OR REPLACE INTO ibkr_fx_rates (date, from_currency, to_currency, rate) VALUES (?, ?, ?, ?)`,
          args: [date, currency, 'SGD', rate]
        });
      } catch {
        // Ignore errors
      }
    }

    // Create import record
    const importResult = await db.execute({
      sql: `INSERT INTO ibkr_imports (filename, statement_start, statement_end, trade_count, dividend_count)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        file.name,
        parseResult.statementStart,
        parseResult.statementEnd,
        parseResult.trades.length,
        parseResult.income.length
      ]
    });
    const importId = Number(importResult.lastInsertRowid);

    // Insert trades (skip duplicates) and update FX rates for existing trades
    let tradesInserted = 0;
    for (const trade of parseResult.trades) {
      try {
        await db.execute({
          sql: `INSERT OR IGNORE INTO ibkr_trades 
                (import_id, trade_date, settle_date, symbol, description, asset_class, action, quantity, price, currency, fx_rate, proceeds, cost_basis, realized_pnl, commission, fees)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            importId,
            trade.tradeDate,
            trade.settleDate,
            trade.symbol,
            trade.description,
            trade.assetClass,
            trade.action,
            trade.quantity,
            trade.price,
            trade.currency,
            trade.fxRate,
            trade.proceeds,
            trade.costBasis,
            trade.realizedPnl,
            trade.commission,
            trade.fees
          ]
        });
        tradesInserted++;
      } catch {
        // Duplicate entry, skip
      }
      
      // Also update FX rate for existing trades (in case they had wrong rate)
      if (trade.fxRate && trade.fxRate !== 1) {
        await db.execute({
          sql: `UPDATE ibkr_trades SET fx_rate = ? 
                WHERE symbol = ? AND trade_date = ? AND quantity = ? AND price = ? AND currency = ?`,
          args: [trade.fxRate, trade.symbol, trade.tradeDate, trade.quantity, trade.price, trade.currency]
        });
      }
    }
    
    // Update FX rates for ALL existing trades from stored rates
    const storedFxRates = await db.execute('SELECT date, from_currency, rate FROM ibkr_fx_rates WHERE to_currency = ?', ['SGD']);
    for (const fxRow of storedFxRates.rows) {
      await db.execute({
        sql: `UPDATE ibkr_trades SET fx_rate = ? WHERE trade_date = ? AND currency = ? AND fx_rate = 1`,
        args: [fxRow.rate, fxRow.date, fxRow.from_currency]
      });
    }

    // Insert income records (skip duplicates)
    let incomeInserted = 0;
    for (const income of parseResult.income) {
      try {
        await db.execute({
          sql: `INSERT OR IGNORE INTO ibkr_income 
                (import_id, date, symbol, description, income_type, amount, currency, fx_rate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            importId,
            income.date,
            income.symbol,
            income.description,
            income.incomeType,
            income.amount,
            income.currency,
            income.fxRate
          ]
        });
        incomeInserted++;
      } catch {
        // Duplicate entry, skip
      }
    }

    // Recalculate positions from all trades
    const allTradesResult = await db.execute('SELECT * FROM ibkr_trades ORDER BY trade_date ASC');
    const allTrades = allTradesResult.rows.map(row => ({
      tradeDate: String(row.trade_date),
      settleDate: row.settle_date ? String(row.settle_date) : null,
      symbol: String(row.symbol),
      description: String(row.description || ''),
      assetClass: String(row.asset_class || 'STK'),
      action: row.action as 'BUY' | 'SELL',
      quantity: Number(row.quantity),
      price: Number(row.price),
      currency: String(row.currency),
      fxRate: Number(row.fx_rate || 1),
      proceeds: row.proceeds ? Number(row.proceeds) : null,
      costBasis: row.cost_basis ? Number(row.cost_basis) : null,
      realizedPnl: row.realized_pnl ? Number(row.realized_pnl) : null,
      commission: Number(row.commission || 0),
      fees: Number(row.fees || 0),
    }));

    const { positions, totalRealizedPnl, totalRealizedPnlBase } = calculatePositions(allTrades, 'SGD');

    // Update positions table
    await db.execute('DELETE FROM ibkr_positions');
    for (const [symbol, pos] of Array.from(positions.entries())) {
      await db.execute({
        sql: `INSERT INTO ibkr_positions (symbol, quantity, avg_cost, currency, total_cost, total_cost_base, realized_pnl, realized_pnl_base, avg_fx_rate)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [symbol, pos.quantity, pos.avgCost, pos.currency, pos.totalCost, pos.totalCostBase, pos.realizedPnl, pos.realizedPnlBase, pos.avgFxRate]
      });
    }

    // Store total realized P&L (including closed positions)
    await db.execute({
      sql: `UPDATE ibkr_portfolio_meta SET total_realized_pnl = ?, total_realized_pnl_base = ?, updated_at = datetime('now') WHERE id = 1`,
      args: [totalRealizedPnl, totalRealizedPnlBase]
    });

    return NextResponse.json({
      success: true,
      importId,
      filename: file.name,
      statementPeriod: {
        start: parseResult.statementStart,
        end: parseResult.statementEnd
      },
      totalRealizedPnl,
      totalRealizedPnlBase,
      tradesFound: parseResult.trades.length,
      tradesInserted,
      incomeFound: parseResult.income.length,
      incomeInserted,
      positionsUpdated: positions.size,
      warnings: parseResult.errors.length > 0 ? parseResult.errors : undefined
    });
  } catch (error) {
    console.error('IBKR upload error:', error);
    return NextResponse.json({ 
      error: 'Failed to process file',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
