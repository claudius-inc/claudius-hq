import { NextRequest, NextResponse } from 'next/server';
import { db, ibkrTrades } from '@/db';
import { eq, desc, sql, count } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    let tradesQuery;
    let countQuery;

    if (symbol) {
      tradesQuery = db
        .select()
        .from(ibkrTrades)
        .where(eq(ibkrTrades.symbol, symbol.toUpperCase()))
        .orderBy(desc(ibkrTrades.tradeDate), desc(ibkrTrades.id))
        .limit(limit)
        .offset(offset);

      countQuery = db
        .select({ count: count() })
        .from(ibkrTrades)
        .where(eq(ibkrTrades.symbol, symbol.toUpperCase()));
    } else {
      tradesQuery = db
        .select()
        .from(ibkrTrades)
        .orderBy(desc(ibkrTrades.tradeDate), desc(ibkrTrades.id))
        .limit(limit)
        .offset(offset);

      countQuery = db.select({ count: count() }).from(ibkrTrades);
    }

    const [tradesData, countData] = await Promise.all([tradesQuery, countQuery]);
    const total = Number(countData[0]?.count || 0);

    const trades = tradesData.map(row => ({
      id: row.id,
      tradeDate: row.tradeDate,
      settleDate: row.settleDate,
      symbol: row.symbol,
      description: row.description,
      assetClass: row.assetClass,
      action: row.action,
      quantity: Number(row.quantity),
      price: Number(row.price),
      currency: row.currency,
      fxRate: Number(row.fxRate),
      proceeds: row.proceeds ? Number(row.proceeds) : null,
      costBasis: row.costBasis ? Number(row.costBasis) : null,
      realizedPnl: row.realizedPnl ? Number(row.realizedPnl) : null,
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
    const { id } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: 'Trade ID required' }, { status: 400 });
    }

    await db.delete(ibkrTrades).where(eq(ibkrTrades.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Trade delete error:', error);
    return NextResponse.json({ error: 'Failed to delete trade' }, { status: 500 });
  }
}
