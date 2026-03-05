import { NextResponse } from "next/server";
import { db, congressTrades } from "@/db";
import { sql } from "drizzle-orm";

// Sync endpoint - called by cron job
export const dynamic = "force-dynamic";

interface CapitolTrade {
  _txId?: string;
  txDate?: string;
  filingDate?: string;
  politician?: {
    name?: string;
    party?: string;
    chamber?: string;
    state?: string;
  };
  issuer?: {
    ticker?: string;
  };
  txType?: string;
  value?: string;
}

async function fetchCapitolTrades(): Promise<CapitolTrade[]> {
  try {
    const res = await fetch("https://bff.capitoltrades.com/trades?pageSize=100", {
      headers: {
        "Accept": "application/json",
        "User-Agent": "ClaudiusHQ/1.0",
      },
    });

    if (!res.ok) {
      console.error("Capitol Trades API error:", res.status);
      return [];
    }

    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.error("Failed to fetch Capitol Trades:", e);
    return [];
  }
}

export async function POST() {
  try {
    const trades = await fetchCapitolTrades();
    
    if (trades.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "No trades fetched from source",
        synced: 0,
      });
    }
    
    let synced = 0;
    
    for (const trade of trades) {
      if (!trade.txDate || !trade.issuer?.ticker) continue;
      
      const sourceId = trade._txId || `${trade.txDate}-${trade.politician?.name}-${trade.issuer?.ticker}`;
      
      // Upsert using ON CONFLICT
      await db.run(sql`
        INSERT INTO congress_trades (
          member_name, party, state, chamber, ticker,
          transaction_type, amount_range, transaction_date, filed_date, source_id
        ) VALUES (
          ${trade.politician?.name || "Unknown"},
          ${trade.politician?.party || null},
          ${trade.politician?.state || null},
          ${trade.politician?.chamber?.toLowerCase() || null},
          ${trade.issuer?.ticker || "N/A"},
          ${trade.txType?.toLowerCase().includes("purchase") ? "purchase" : "sale"},
          ${trade.value || null},
          ${trade.txDate},
          ${trade.filingDate || null},
          ${sourceId}
        )
        ON CONFLICT(id) DO NOTHING
      `);
      
      synced++;
    }
    
    return NextResponse.json({
      success: true,
      synced,
      total: trades.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Congress trades sync error:", e);
    return NextResponse.json({
      success: false,
      error: String(e),
      synced: 0,
    }, { status: 500 });
  }
}
