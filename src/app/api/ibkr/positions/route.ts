import { NextResponse } from 'next/server';
import db, { ensureDB } from '@/lib/db';
import YahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const revalidate = 60; // 1 minute cache

const yf = new YahooFinance();

// Currency to USD conversion pairs for Yahoo Finance
const FX_PAIRS: Record<string, string> = {
  'HKD': 'HKDUSD=X',
  'SGD': 'SGDUSD=X',
  'EUR': 'EURUSD=X',
  'GBP': 'GBPUSD=X',
  'JPY': 'JPYUSD=X',
  'CNY': 'CNYUSD=X',
  'AUD': 'AUDUSD=X',
  'CAD': 'CADUSD=X',
};

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

    // Get unique currencies that need conversion
    const currencies = Array.from(new Set(positions.map(p => p.currency).filter(c => c !== 'USD')));
    const fxRates: Record<string, number> = { 'USD': 1 };

    // Fetch FX rates
    if (currencies.length > 0) {
      const fxSymbols = currencies.map(c => FX_PAIRS[c]).filter(Boolean);
      if (fxSymbols.length > 0) {
        try {
          const fxQuotes = await yf.quote(fxSymbols);
          const fxArray = Array.isArray(fxQuotes) ? fxQuotes : [fxQuotes];
          for (const quote of fxArray) {
            if (quote && quote.symbol) {
              // Extract currency code from symbol (e.g., HKDUSD=X -> HKD)
              const currency = quote.symbol.replace('USD=X', '');
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

    // Calculate P&L with FX conversion
    const enrichedPositions = positions.map(pos => {
      const quote = priceMap.get(pos.symbol);
      const currentPrice = quote?.price || pos.avgCost;
      const priceCurrency = quote?.currency || pos.currency;
      const marketValue = currentPrice * pos.quantity;
      const unrealizedPnl = marketValue - pos.totalCost;
      const unrealizedPnlPct = pos.totalCost > 0 ? (unrealizedPnl / pos.totalCost) * 100 : 0;
      
      // FX rate to convert to USD
      const fxRate = fxRates[priceCurrency] || 1;
      const marketValueUSD = marketValue * fxRate;
      const totalCostUSD = pos.totalCost * fxRate;
      const unrealizedPnlUSD = unrealizedPnl * fxRate;
      const realizedPnlUSD = pos.realizedPnl * fxRate;
      const dayChangeUSD = (quote?.change || 0) * pos.quantity * fxRate;
      
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
        // USD-converted values for summary
        fxRate,
        marketValueUSD,
        totalCostUSD,
        unrealizedPnlUSD,
        realizedPnlUSD,
        dayChangeUSD,
      };
    });

    // Calculate totals in USD
    const totalCostUSD = enrichedPositions.reduce((sum, p) => sum + p.totalCostUSD, 0);
    const totalMarketValueUSD = enrichedPositions.reduce((sum, p) => sum + p.marketValueUSD, 0);
    const totalUnrealizedPnlUSD = enrichedPositions.reduce((sum, p) => sum + p.unrealizedPnlUSD, 0);
    const totalRealizedPnlUSD = enrichedPositions.reduce((sum, p) => sum + p.realizedPnlUSD, 0);
    const dayPnlUSD = enrichedPositions.reduce((sum, p) => sum + p.dayChangeUSD, 0);

    return NextResponse.json({
      positions: enrichedPositions,
      fxRates,
      summary: {
        totalCost: totalCostUSD,
        totalMarketValue: totalMarketValueUSD,
        totalUnrealizedPnl: totalUnrealizedPnlUSD,
        totalUnrealizedPnlPct: totalCostUSD > 0 ? (totalUnrealizedPnlUSD / totalCostUSD) * 100 : 0,
        totalRealizedPnl: totalRealizedPnlUSD,
        dayPnl: dayPnlUSD,
        dayPnlPct: totalMarketValueUSD > 0 ? (dayPnlUSD / totalMarketValueUSD) * 100 : 0,
        baseCurrency: 'USD',
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
