import { NextRequest, NextResponse } from 'next/server';
import db, { ensureDB } from '@/lib/db';
import type { InValue } from '@libsql/client';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await ensureDB();
    
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    let sql = `SELECT * FROM ibkr_trades`;
    const args: InValue[] = [];

    if (symbol) {
      sql += ` WHERE symbol = ?`;
      args.push(symbol.toUpperCase());
    }

    sql += ` ORDER BY trade_date DESC, id DESC LIMIT ? OFFSET ?`;
    args.push(limit, offset);

    const result = await db.execute({ sql, args });

    // Get total count
    let countSql = 'SELECT COUNT(*) as count FROM ibkr_trades';
    const countArgs: InValue[] = [];
    if (symbol) {
      countSql += ' WHERE symbol = ?';
      countArgs.push(symbol.toUpperCase());
    }
    const countResult = await db.execute({ sql: countSql, args: countArgs });
    const total = Number(countResult.rows[0].count);

    const trades = result.rows.map(row => ({
      id: row.id,
      tradeDate: row.trade_date,
      settleDate: row.settle_date,
      symbol: row.symbol,
      description: row.description,
      assetClass: row.asset_class,
      action: row.action,
      quantity: Number(row.quantity),
      price: Number(row.price),
      currency: row.currency,
      fxRate: Number(row.fx_rate),
      proceeds: row.proceeds ? Number(row.proceeds) : null,
      costBasis: row.cost_basis ? Number(row.cost_basis) : null,
      realizedPnl: row.realized_pnl ? Number(row.realized_pnl) : null,
      commission: Number(row.commission),
      fees: Number(row.fees),
      total: Number(row.quantity) * Number(row.price) + Number(row.commission || 0) + Number(row.fees || 0),
    }));

    return NextResponse.json({
      trades,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    console.error('Trades fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}

// Delete a trade
export async function DELETE(request: NextRequest) {
  try {
    await ensureDB();
    
    const { id } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: 'Trade ID required' }, { status: 400 });
    }

    await db.execute({
      sql: 'DELETE FROM ibkr_trades WHERE id = ?',
      args: [id]
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Trade delete error:', error);
    return NextResponse.json({ error: 'Failed to delete trade' }, { status: 500 });
  }
}
