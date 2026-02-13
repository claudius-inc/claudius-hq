import { NextResponse } from 'next/server';
import db, { ensureDB } from '@/lib/db';
import YahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const revalidate = 60; // 1 minute cache

const yf = new YahooFinance();

// Base currency for portfolio summary
const BASE_CURRENCY = 'SGD';

// Currency to SGD conversion pairs for Yahoo Finance
// Format: XXXSGD=X means "1 XXX = ? SGD"
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
    await ensureDB();
    
    // Get portfolio meta (total realized P&L including closed positions)
    const metaResult = await db.execute('SELECT * FROM ibkr_portfolio_meta WHERE id = 1');
    const meta = metaResult.rows[0] || {};
    const portfolioTotalRealizedPnlBase = Number(meta.total_realized_pnl_base || 0);
    
    const result = await db.execute('SELECT * FROM ibkr_positions ORDER BY total_cost_base DESC');
    
    const positions = result.rows.map(row => ({
      symbol: String(row.symbol),
      quantity: Number(row.quantity),
      avgCost: Number(row.avg_cost),
      currency: String(row.currency),
      totalCost: Number(row.total_cost),
      totalCostBase: Number(row.total_cost_base || 0),  // Historical cost in SGD
      realizedPnl: Number(row.realized_pnl),
      realizedPnlBase: Number(row.realized_pnl_base || 0),  // Historical realized P&L in SGD
      avgFxRate: Number(row.avg_fx_rate || 1),  // Weighted avg FX rate at purchase
    }));

    // Get unique currencies that need conversion to SGD
    const currencies = Array.from(new Set(positions.map(p => p.currency).filter(c => c !== BASE_CURRENCY)));
    const fxRates: Record<string, number> = { [BASE_CURRENCY]: 1 };

    // Fetch FX rates to convert to SGD
    if (currencies.length > 0) {
      const fxSymbols = currencies.map(c => FX_PAIRS[c]).filter(Boolean);
      if (fxSymbols.length > 0) {
        try {
          const fxQuotes = await yf.quote(fxSymbols);
          const fxArray = Array.isArray(fxQuotes) ? fxQuotes : [fxQuotes];
          for (const quote of fxArray) {
            if (quote && quote.symbol) {
              // Extract currency code from symbol (e.g., HKDSGD=X -> HKD)
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

    // Calculate P&L using:
    // - Historical FX rate for cost basis (stored in DB, fetched at import time)
    // - Live FX rate for market value (current value if sold today)
    const enrichedPositions = positions.map(pos => {
      const quote = priceMap.get(pos.symbol);
      const currentPrice = quote?.price || pos.avgCost;
      const priceCurrency = quote?.currency || pos.currency;
      const marketValue = currentPrice * pos.quantity;
      const unrealizedPnl = marketValue - pos.totalCost;
      const unrealizedPnlPct = pos.totalCost > 0 ? (unrealizedPnl / pos.totalCost) * 100 : 0;
      
      // Live FX rate for current market value
      const liveFxRate = fxRates[priceCurrency] || 1;
      const marketValueBase = marketValue * liveFxRate;
      
      // Historical FX rate for cost basis (from DB, fetched at import using trade date)
      // pos.totalCostBase was calculated using historical rates at import time
      const historicalCostBase = pos.totalCostBase > 0 ? pos.totalCostBase : pos.totalCost * liveFxRate;
      
      // P&L = Current value (live FX) - Historical cost (historical FX)
      // This captures both price change AND FX movement
      const unrealizedPnlBase = marketValueBase - historicalCostBase;
      const unrealizedPnlBasePct = historicalCostBase > 0 ? (unrealizedPnlBase / historicalCostBase) * 100 : 0;
      
      // Day change in base currency (using live FX)
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
        // Base currency (SGD) values
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

    // Calculate totals in base currency (SGD)
    const totalCostBase = enrichedPositions.reduce((sum, p) => sum + p.totalCostBase, 0);
    const totalMarketValueBase = enrichedPositions.reduce((sum, p) => sum + p.marketValueBase, 0);
    const totalUnrealizedPnlBase = enrichedPositions.reduce((sum, p) => sum + p.unrealizedPnlBase, 0);
    const totalRealizedPnlBase = enrichedPositions.reduce((sum, p) => sum + p.realizedPnlBase, 0);
    const dayPnlBase = enrichedPositions.reduce((sum, p) => sum + p.dayChangeBase, 0);

    // For closed positions' realized P&L, we'd need to track currency per trade
    // For now, use the sum from open positions (closed positions need separate handling)
    
    return NextResponse.json({
      positions: enrichedPositions,
      fxRates,
      baseCurrency: BASE_CURRENCY,
      summary: {
        totalCost: totalCostBase,
        totalMarketValue: totalMarketValueBase,
        totalUnrealizedPnl: totalUnrealizedPnlBase,
        totalUnrealizedPnlPct: totalCostBase > 0 ? (totalUnrealizedPnlBase / totalCostBase) * 100 : 0,
        totalRealizedPnl: totalRealizedPnlBase,  // From open positions only for now
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

    const { positions, totalRealizedPnl, totalRealizedPnlBase } = calculatePositions(trades, 'SGD');

    // Clear and rebuild positions
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
