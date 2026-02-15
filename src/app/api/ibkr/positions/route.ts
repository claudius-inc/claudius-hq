import { NextResponse } from 'next/server';
import { db, ibkrPositions, ibkrPortfolioMeta, ibkrTrades } from '@/db';
import { eq, desc, asc } from 'drizzle-orm';
import YahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const revalidate = 60; // 1 minute cache

const yf = new YahooFinance();

// Base currency for portfolio summary
const BASE_CURRENCY = 'SGD';

// Currency to SGD conversion pairs for Yahoo Finance
const FX_PAIRS: Record<string, string> = {
  'USD': 'USDSGD=X',
  'HKD': 'HKDSGD=X',
  'EUR': 'EURSGD=X',
  'GBP': 'GBPSGD=X',
  'JPY': 'JPYSGD=X',
  'CNY': 'CNYSGD=X',
  'AUD': 'AUDSGD=X',
  'CAD': 'CADSGD=X',
};

export async function GET() {
  try {
    // Get portfolio meta
    const [meta] = await db.select().from(ibkrPortfolioMeta).where(eq(ibkrPortfolioMeta.id, 1));
    const portfolioTotalRealizedPnlBase = Number(meta?.totalRealizedPnlBase || 0);
    
    const positionsData = await db
      .select()
      .from(ibkrPositions)
      .orderBy(desc(ibkrPositions.totalCostBase));
    
    const positions = positionsData.map(row => ({
      symbol: String(row.symbol),
      quantity: Number(row.quantity),
      avgCost: Number(row.avgCost),
      currency: String(row.currency),
      totalCost: Number(row.totalCost),
      totalCostBase: Number(row.totalCostBase || 0),
      realizedPnl: Number(row.realizedPnl),
      realizedPnlBase: Number(row.realizedPnlBase || 0),
      avgFxRate: Number(row.avgFxRate || 1),
    }));

    // Get unique currencies
    const currencies = Array.from(new Set(positions.map(p => p.currency).filter(c => c !== BASE_CURRENCY)));
    const fxRates: Record<string, number> = { [BASE_CURRENCY]: 1 };

    // Fetch FX rates
    if (currencies.length > 0) {
      const fxSymbols = currencies.map(c => FX_PAIRS[c]).filter(Boolean);
      if (fxSymbols.length > 0) {
        try {
          const fxQuotes = await yf.quote(fxSymbols);
          const fxArray = Array.isArray(fxQuotes) ? fxQuotes : [fxQuotes];
          for (const quote of fxArray) {
            if (quote && quote.symbol) {
              const currency = quote.symbol.replace('SGD=X', '');
              fxRates[currency] = quote.regularMarketPrice || 1;
            }
          }
        } catch (err) {
          console.error('Failed to fetch FX rates:', err);
        }
      }
    }

    // Fetch live stock prices
    const symbols = positions.map(p => p.symbol);
    const priceMap = new Map<string, { price: number; change: number; changePct: number; currency: string }>();
    
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
              currency: quote.currency || 'USD',
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
      const priceCurrency = quote?.currency || pos.currency;
      const marketValue = currentPrice * pos.quantity;
      const unrealizedPnl = marketValue - pos.totalCost;
      const unrealizedPnlPct = pos.totalCost > 0 ? (unrealizedPnl / pos.totalCost) * 100 : 0;
      
      const liveFxRate = fxRates[priceCurrency] || 1;
      const marketValueBase = marketValue * liveFxRate;
      const historicalCostBase = pos.totalCostBase > 0 ? pos.totalCostBase : pos.totalCost * liveFxRate;
      const unrealizedPnlBase = marketValueBase - historicalCostBase;
      const unrealizedPnlBasePct = historicalCostBase > 0 ? (unrealizedPnlBase / historicalCostBase) * 100 : 0;
      const dayChangeBase = (quote?.change || 0) * pos.quantity * liveFxRate;
      
      return {
        ...pos,
        currentPrice,
        priceCurrency,
        dayChange: quote?.change || 0,
        dayChangePct: quote?.changePct || 0,
        marketValue,
        unrealizedPnl,
        unrealizedPnlPct,
        totalPnl: unrealizedPnl + pos.realizedPnl,
        liveFxRate,
        historicalFxRate: pos.avgFxRate,
        marketValueBase,
        totalCostBase: historicalCostBase,
        unrealizedPnlBase,
        unrealizedPnlBasePct,
        realizedPnlBase: pos.realizedPnlBase || 0,
        dayChangeBase,
      };
    });

    // Calculate totals
    const totalCostBase = enrichedPositions.reduce((sum, p) => sum + p.totalCostBase, 0);
    const totalMarketValueBase = enrichedPositions.reduce((sum, p) => sum + p.marketValueBase, 0);
    const totalUnrealizedPnlBase = enrichedPositions.reduce((sum, p) => sum + p.unrealizedPnlBase, 0);
    const dayPnlBase = enrichedPositions.reduce((sum, p) => sum + p.dayChangeBase, 0);

    // Get total realized P&L from sell trades
    const sellTrades = await db
      .select({
        realizedPnl: ibkrTrades.realizedPnl,
        fxRate: ibkrTrades.fxRate,
        currency: ibkrTrades.currency,
      })
      .from(ibkrTrades)
      .where(eq(ibkrTrades.action, 'SELL'));

    let totalRealizedPnlBase = 0;
    for (const trade of sellTrades) {
      if (trade.realizedPnl !== null) {
        const pnl = Number(trade.realizedPnl);
        const fxRate = Number(trade.fxRate || 1);
        totalRealizedPnlBase += pnl * fxRate;
      }
    }
    
    return NextResponse.json({
      positions: enrichedPositions,
      fxRates,
      baseCurrency: BASE_CURRENCY,
      summary: {
        totalCost: totalCostBase,
        totalMarketValue: totalMarketValueBase,
        totalUnrealizedPnl: totalUnrealizedPnlBase,
        totalUnrealizedPnlPct: totalCostBase > 0 ? (totalUnrealizedPnlBase / totalCostBase) * 100 : 0,
        totalRealizedPnl: totalRealizedPnlBase,
        dayPnl: dayPnlBase,
        dayPnlPct: totalMarketValueBase > 0 ? (dayPnlBase / totalMarketValueBase) * 100 : 0,
        baseCurrency: BASE_CURRENCY,
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
    const { calculatePositions } = await import('@/lib/ibkr-parser');
    
    const tradesData = await db
      .select()
      .from(ibkrTrades)
      .orderBy(asc(ibkrTrades.tradeDate));

    const trades = tradesData.map(row => ({
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

    const { positions, totalRealizedPnl, totalRealizedPnlBase } = calculatePositions(trades, 'SGD');

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

    // Update portfolio meta
    await db
      .update(ibkrPortfolioMeta)
      .set({
        totalRealizedPnl,
        totalRealizedPnlBase,
        updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      })
      .where(eq(ibkrPortfolioMeta.id, 1));

    return NextResponse.json({ 
      success: true, 
      positionsUpdated: positions.size,
      totalRealizedPnlBase,
    });
  } catch (error) {
    console.error('Position recalculation error:', error);
    return NextResponse.json({ error: 'Failed to recalculate positions' }, { status: 500 });
  }
}
