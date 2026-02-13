import { NextResponse } from 'next/server';
import db, { ensureDB } from '@/lib/db';
import YahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const revalidate = 60; // 1 minute cache

const yf = new YahooFinance();

export async function GET() {
  try {
    await ensureDB();
    
    const result = await db.execute('SELECT * FROM ibkr_positions ORDER BY total_cost DESC');
    
    const positions = result.rows.map(row => ({
      symbol: String(row.symbol),
      quantity: Number(row.quantity),
      avgCost: Number(row.avg_cost),
      currency: String(row.currency),
      totalCost: Number(row.total_cost),
      realizedPnl: Number(row.realized_pnl),
    }));

    // Fetch live prices
    const symbols = positions.map(p => p.symbol);
    const priceMap = new Map<string, { price: number; change: number; changePct: number }>();
    
    if (symbols.length > 0) {
      try {
        const quotes = await yf.quote(symbols);
        const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
        
        for (const quote of quotesArray) {
          if (quote && quote.symbol) {
            priceMap.set(quote.symbol, {
              price: quote.regularMarketPrice || 0,
              change: quote.regularMarketChange || 0,
              changePct: quote.regularMarketChangePercent || 0,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch quotes:', err);
      }
    }

    // Calculate P&L
    const enrichedPositions = positions.map(pos => {
      const quote = priceMap.get(pos.symbol);
      const currentPrice = quote?.price || pos.avgCost;
      const marketValue = currentPrice * pos.quantity;
      const unrealizedPnl = marketValue - pos.totalCost;
      const unrealizedPnlPct = pos.totalCost > 0 ? (unrealizedPnl / pos.totalCost) * 100 : 0;
      
      return {
        ...pos,
        currentPrice,
        dayChange: quote?.change || 0,
        dayChangePct: quote?.changePct || 0,
        marketValue,
        unrealizedPnl,
        unrealizedPnlPct,
        totalPnl: unrealizedPnl + pos.realizedPnl,
      };
    });

    // Calculate totals
    const totalCost = enrichedPositions.reduce((sum, p) => sum + p.totalCost, 0);
    const totalMarketValue = enrichedPositions.reduce((sum, p) => sum + p.marketValue, 0);
    const totalUnrealizedPnl = enrichedPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const totalRealizedPnl = enrichedPositions.reduce((sum, p) => sum + p.realizedPnl, 0);
    const dayPnl = enrichedPositions.reduce((sum, p) => sum + (p.dayChange * p.quantity), 0);

    return NextResponse.json({
      positions: enrichedPositions,
      summary: {
        totalCost,
        totalMarketValue,
        totalUnrealizedPnl,
        totalUnrealizedPnlPct: totalCost > 0 ? (totalUnrealizedPnl / totalCost) * 100 : 0,
        totalRealizedPnl,
        dayPnl,
        dayPnlPct: totalMarketValue > 0 ? (dayPnl / totalMarketValue) * 100 : 0,
      }
    });
  } catch (error) {
    console.error('Positions fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
  }
}

// Recalculate positions from trades
export async function POST() {
  try {
    await ensureDB();
    
    // Import the calculation function
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

    const positions = calculatePositions(trades);

    // Clear and rebuild positions
    await db.execute('DELETE FROM ibkr_positions');
    for (const [symbol, pos] of Array.from(positions.entries())) {
      await db.execute({
        sql: `INSERT INTO ibkr_positions (symbol, quantity, avg_cost, currency, total_cost, realized_pnl)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [symbol, pos.quantity, pos.avgCost, pos.currency, pos.totalCost, pos.realizedPnl]
      });
    }

    return NextResponse.json({ 
      success: true, 
      positionsUpdated: positions.size 
    });
  } catch (error) {
    console.error('Position recalculation error:', error);
    return NextResponse.json({ error: 'Failed to recalculate positions' }, { status: 500 });
  }
}
