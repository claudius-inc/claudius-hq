import { NextRequest, NextResponse } from 'next/server';
import db, { ensureDB } from '@/lib/db';
import { parseIBKRStatement, calculatePositions } from '@/lib/ibkr-parser';

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

    // Insert trades (skip duplicates)
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

    const positions = calculatePositions(allTrades, 'SGD');

    // Update positions table
    await db.execute('DELETE FROM ibkr_positions');
    for (const [symbol, pos] of Array.from(positions.entries())) {
      await db.execute({
        sql: `INSERT INTO ibkr_positions (symbol, quantity, avg_cost, currency, total_cost, total_cost_base, realized_pnl, realized_pnl_base, avg_fx_rate)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [symbol, pos.quantity, pos.avgCost, pos.currency, pos.totalCost, pos.totalCostBase, pos.realizedPnl, pos.realizedPnlBase, pos.avgFxRate]
      });
    }

    return NextResponse.json({
      success: true,
      importId,
      filename: file.name,
      statementPeriod: {
        start: parseResult.statementStart,
        end: parseResult.statementEnd
      },
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
