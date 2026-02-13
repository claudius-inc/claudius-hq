import { NextRequest, NextResponse } from 'next/server';
import db, { ensureDB } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await ensureDB();
    
    const result = await db.execute(`
      SELECT * FROM ibkr_imports 
      ORDER BY created_at DESC 
      LIMIT 50
    `);

    const imports = result.rows.map(row => ({
      id: row.id,
      filename: row.filename,
      statementStart: row.statement_start,
      statementEnd: row.statement_end,
      tradeCount: Number(row.trade_count),
      dividendCount: Number(row.dividend_count),
      createdAt: row.created_at,
    }));

    return NextResponse.json({ imports });
  } catch (error) {
    console.error('Imports fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch imports' }, { status: 500 });
  }
}

// Delete an import and its associated trades
export async function DELETE(request: NextRequest) {
  try {
    await ensureDB();
    
    const { id } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: 'Import ID required' }, { status: 400 });
    }

    // Delete associated records
    await db.execute({
      sql: 'DELETE FROM ibkr_trades WHERE import_id = ?',
      args: [id]
    });
    await db.execute({
      sql: 'DELETE FROM ibkr_income WHERE import_id = ?',
      args: [id]
    });
    await db.execute({
      sql: 'DELETE FROM ibkr_imports WHERE id = ?',
      args: [id]
    });

    // Recalculate positions
    const { calculatePositions } = await import('@/lib/ibkr-parser');
    const result = await db.execute('SELECT * FROM ibkr_trades ORDER BY trade_date ASC');
    const trades = result.rows.map(row => ({
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

    const { positions, totalRealizedPnl, totalRealizedPnlBase } = calculatePositions(trades, 'SGD');

    await db.execute('DELETE FROM ibkr_positions');
    for (const [symbol, pos] of Array.from(positions.entries())) {
      await db.execute({
        sql: `INSERT INTO ibkr_positions (symbol, quantity, avg_cost, currency, total_cost, total_cost_base, realized_pnl, realized_pnl_base, avg_fx_rate)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [symbol, pos.quantity, pos.avgCost, pos.currency, pos.totalCost, pos.totalCostBase, pos.realizedPnl, pos.realizedPnlBase, pos.avgFxRate]
      });
    }

    // Update portfolio meta with total realized P&L (includes closed positions)
    await db.execute({
      sql: `UPDATE ibkr_portfolio_meta SET total_realized_pnl = ?, total_realized_pnl_base = ?, updated_at = datetime('now') WHERE id = 1`,
      args: [totalRealizedPnl, totalRealizedPnlBase]
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Import delete error:', error);
    return NextResponse.json({ error: 'Failed to delete import' }, { status: 500 });
  }
}
