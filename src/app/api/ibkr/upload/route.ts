import { NextRequest, NextResponse } from 'next/server';
import { db, ibkrImports, ibkrTrades, ibkrIncome, ibkrFxRates, ibkrPositions, ibkrPortfolioMeta } from '@/db';
import { eq, and, asc } from 'drizzle-orm';
import { parseIBKRStatement, calculatePositions } from '@/lib/ibkr-parser';
import { getHistoricalFxRates, getFxRateFromCache } from '@/lib/historical-fx';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
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
        trade.fxRate = rate;
      } else {
        trade.fxRate = 1;
      }
    }

    // Store historical FX rates in database
    for (const [key, rate] of Array.from(historicalFxRates.entries())) {
      const [currency, date] = key.split(':');
      try {
        // Check if exists, then insert or update
        const [existing] = await db
          .select({ id: ibkrFxRates.id })
          .from(ibkrFxRates)
          .where(and(
            eq(ibkrFxRates.date, date),
            eq(ibkrFxRates.fromCurrency, currency),
            eq(ibkrFxRates.toCurrency, 'SGD')
          ));
        
        if (existing) {
          await db
            .update(ibkrFxRates)
            .set({ rate })
            .where(eq(ibkrFxRates.id, existing.id));
        } else {
          await db.insert(ibkrFxRates).values({
            date,
            fromCurrency: currency,
            toCurrency: 'SGD',
            rate,
          });
        }
      } catch {
        // Ignore errors
      }
    }

    // Create import record
    const [importRecord] = await db
      .insert(ibkrImports)
      .values({
        filename: file.name,
        statementStart: parseResult.statementStart,
        statementEnd: parseResult.statementEnd,
        tradeCount: parseResult.trades.length,
        dividendCount: parseResult.income.length,
      })
      .returning();
    
    const importId = importRecord.id;

    // Insert trades (skip duplicates)
    let tradesInserted = 0;
    for (const trade of parseResult.trades) {
      try {
        // Check for duplicate
        const [existing] = await db
          .select({ id: ibkrTrades.id })
          .from(ibkrTrades)
          .where(and(
            eq(ibkrTrades.tradeDate, trade.tradeDate),
            eq(ibkrTrades.symbol, trade.symbol),
            eq(ibkrTrades.action, trade.action),
            eq(ibkrTrades.quantity, trade.quantity),
            eq(ibkrTrades.price, trade.price)
          ));

        if (!existing) {
          await db.insert(ibkrTrades).values({
            importId,
            tradeDate: trade.tradeDate,
            settleDate: trade.settleDate,
            symbol: trade.symbol,
            description: trade.description,
            assetClass: trade.assetClass,
            action: trade.action,
            quantity: trade.quantity,
            price: trade.price,
            currency: trade.currency,
            fxRate: trade.fxRate,
            proceeds: trade.proceeds,
            costBasis: trade.costBasis,
            realizedPnl: trade.realizedPnl,
            commission: trade.commission,
            fees: trade.fees,
          });
          tradesInserted++;
        }
        
        // Update FX rate for existing trades with fxRate = 1
        if (trade.fxRate && trade.fxRate !== 1) {
          await db
            .update(ibkrTrades)
            .set({ fxRate: trade.fxRate })
            .where(and(
              eq(ibkrTrades.symbol, trade.symbol),
              eq(ibkrTrades.tradeDate, trade.tradeDate),
              eq(ibkrTrades.quantity, trade.quantity),
              eq(ibkrTrades.price, trade.price),
              eq(ibkrTrades.currency, trade.currency)
            ));
        }
      } catch {
        // Skip errors
      }
    }
    
    // Update FX rates for all existing trades from stored rates
    const storedFxRates = await db
      .select()
      .from(ibkrFxRates)
      .where(eq(ibkrFxRates.toCurrency, 'SGD'));
    
    for (const fxRow of storedFxRates) {
      await db
        .update(ibkrTrades)
        .set({ fxRate: fxRow.rate })
        .where(and(
          eq(ibkrTrades.tradeDate, fxRow.date),
          eq(ibkrTrades.currency, fxRow.fromCurrency),
          eq(ibkrTrades.fxRate, 1)
        ));
    }

    // Insert income records (skip duplicates)
    let incomeInserted = 0;
    for (const income of parseResult.income) {
      try {
        // Check for duplicate
        const [existing] = await db
          .select({ id: ibkrIncome.id })
          .from(ibkrIncome)
          .where(and(
            eq(ibkrIncome.date, income.date),
            eq(ibkrIncome.symbol, income.symbol),
            eq(ibkrIncome.incomeType, income.incomeType),
            eq(ibkrIncome.amount, income.amount)
          ));

        if (!existing) {
          await db.insert(ibkrIncome).values({
            importId,
            date: income.date,
            symbol: income.symbol,
            description: income.description,
            incomeType: income.incomeType,
            amount: income.amount,
            currency: income.currency,
            fxRate: income.fxRate,
          });
          incomeInserted++;
        }
      } catch {
        // Skip errors
      }
    }

    // Recalculate positions from all trades
    const allTradesData = await db
      .select()
      .from(ibkrTrades)
      .orderBy(asc(ibkrTrades.tradeDate));

    const allTrades = allTradesData.map(row => ({
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

    const { positions, totalRealizedPnl, totalRealizedPnlBase } = calculatePositions(allTrades, 'SGD');

    // Update positions table
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

    // Store total realized P&L
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
