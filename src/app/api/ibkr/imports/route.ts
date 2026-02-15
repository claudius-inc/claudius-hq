import { NextRequest, NextResponse } from 'next/server';
import { db, ibkrImports, ibkrTrades, ibkrIncome, ibkrPositions, ibkrPortfolioMeta } from '@/db';
import { eq, desc, asc } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const imports = await db
      .select()
      .from(ibkrImports)
      .orderBy(desc(ibkrImports.createdAt))
      .limit(50);

    const formatted = imports.map(row => ({
      id: row.id,
      filename: row.filename,
      statementStart: row.statementStart,
      statementEnd: row.statementEnd,
      tradeCount: row.tradeCount ?? 0,
      dividendCount: row.dividendCount ?? 0,
      createdAt: row.createdAt,
    }));

    return NextResponse.json({ imports: formatted });
  } catch (error) {
    console.error('Imports fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch imports' }, { status: 500 });
  }
}

// Delete an import and its associated trades
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: 'Import ID required' }, { status: 400 });
    }

    // Delete associated records
    await db.delete(ibkrTrades).where(eq(ibkrTrades.importId, id));
    await db.delete(ibkrIncome).where(eq(ibkrIncome.importId, id));
    await db.delete(ibkrImports).where(eq(ibkrImports.id, id));

    // Recalculate positions
    const { calculatePositions } = await import('@/lib/ibkr-parser');
    const trades = await db
      .select()
      .from(ibkrTrades)
      .orderBy(asc(ibkrTrades.tradeDate));

    const formattedTrades = trades.map(row => ({
      tradeDate: String(row.tradeDate),
      settleDate: row.settleDate ? String(row.settleDate) : null,
      symbol: String(row.symbol),
      description: String(row.description || ''),
      assetClass: String(row.assetClass || 'STK'),
      action: row.action as 'BUY' | 'SELL',
      quantity: Number(row.quantity),
      price: Number(row.price),
      currency: String(row.currency),
      fxRate: Number(row.fxRate || 1),
      proceeds: row.proceeds ? Number(row.proceeds) : null,
      costBasis: row.costBasis ? Number(row.costBasis) : null,
      realizedPnl: row.realizedPnl ? Number(row.realizedPnl) : null,
      commission: Number(row.commission || 0),
      fees: Number(row.fees || 0),
    }));

    const { positions, totalRealizedPnl, totalRealizedPnlBase } = calculatePositions(formattedTrades, 'SGD');

    // Clear and rebuild positions
    await db.delete(ibkrPositions);
    
    for (const [symbol, pos] of Array.from(positions.entries())) {
      await db.insert(ibkrPositions).values({
        symbol,
        quantity: pos.quantity,
        avgCost: pos.avgCost,
        currency: pos.currency,
        totalCost: pos.totalCost,
        totalCostBase: pos.totalCostBase,
        realizedPnl: pos.realizedPnl,
        realizedPnlBase: pos.realizedPnlBase,
        avgFxRate: pos.avgFxRate,
      });
    }

    // Update portfolio meta with total realized P&L (includes closed positions)
    await db
      .update(ibkrPortfolioMeta)
      .set({
        totalRealizedPnl,
        totalRealizedPnlBase,
        updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      })
      .where(eq(ibkrPortfolioMeta.id, 1));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Import delete error:', error);
    return NextResponse.json({ error: 'Failed to delete import' }, { status: 500 });
  }
}
