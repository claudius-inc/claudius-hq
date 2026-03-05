import { NextResponse } from "next/server";
import { db, congressTrades } from "@/db";
import { sql } from "drizzle-orm";

// Sync endpoint - called by cron job
export const dynamic = "force-dynamic";

interface CongressTrade {
  memberName: string;
  party: string | null;
  state: string | null;
  chamber: string | null;
  ticker: string;
  transactionType: "purchase" | "sale";
  amountRange: string | null;
  transactionDate: string;
  filedDate: string | null;
  sourceId: string;
}

// Fetch from House Clerk Financial Disclosures
// This is a public data source with structured XML/HTML
async function fetchHouseDisclosures(): Promise<CongressTrade[]> {
  try {
    const currentYear = new Date().getFullYear();
    const res = await fetch(
      `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${currentYear}/`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ClaudiusHQ/1.0)",
          "Accept": "text/html",
        },
      }
    );

    if (!res.ok) {
      console.error("House Clerk error:", res.status);
      return [];
    }

    const html = await res.text();
    const trades: CongressTrade[] = [];
    
    // Parse the directory listing for recent PTR filings
    // Format: <a href="YYYYMMDD_LastName_FirstName.pdf">...</a>
    const linkRegex = /<a href="(\d{8}_[^"]+\.pdf)"[^>]*>/gi;
    let match;
    const seenIds = new Set<string>();
    
    while ((match = linkRegex.exec(html)) !== null) {
      const filename = match[1];
      const dateStr = filename.substring(0, 8);
      const namePart = filename.replace(/\.pdf$/i, "").substring(9);
      const [lastName, firstName] = namePart.split("_").map(s => s.replace(/-/g, " "));
      
      const memberName = `${firstName || ""} ${lastName || ""}`.trim();
      const filedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      const sourceId = `house-ptr-${filename}`;
      
      if (seenIds.has(sourceId)) continue;
      seenIds.add(sourceId);
      
      // Without parsing the PDF, we can only record the filing exists
      // We mark these as potential trades - actual parsing would require PDF extraction
      trades.push({
        memberName,
        party: null,
        state: null,
        chamber: "house",
        ticker: "VARIOUS", // PTR filings may contain multiple tickers
        transactionType: "purchase",
        amountRange: null,
        transactionDate: filedDate,
        filedDate,
        sourceId,
      });
    }
    
    return trades.slice(0, 50); // Limit to most recent 50
  } catch (e) {
    console.error("Failed to fetch House disclosures:", e);
    return [];
  }
}

// Fallback: Fetch from QuiverQuant (free tier) or similar aggregator
async function fetchQuiverQuantTrades(): Promise<CongressTrade[]> {
  try {
    // QuiverQuant provides congressional trading data
    const res = await fetch(
      "https://api.quiverquant.com/beta/live/congresstrading",
      {
        headers: {
          "Accept": "application/json",
          "User-Agent": "ClaudiusHQ/1.0",
        },
      }
    );

    if (!res.ok) {
      console.log("QuiverQuant not available:", res.status);
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data)) return [];
    
    return data.slice(0, 100).map((row: Record<string, unknown>) => ({
      memberName: String(row.Representative || row.Senator || "Unknown"),
      party: row.Party ? String(row.Party).charAt(0) : null,
      state: row.State ? String(row.State) : null,
      chamber: row.House ? "house" : row.Senator ? "senate" : null,
      ticker: String(row.Ticker || "N/A"),
      transactionType: String(row.Transaction || "").toLowerCase().includes("purchase") ? "purchase" as const : "sale" as const,
      amountRange: row.Range ? String(row.Range) : null,
      transactionDate: String(row.TransactionDate || row.ReportDate || new Date().toISOString().split("T")[0]),
      filedDate: row.ReportDate ? String(row.ReportDate) : null,
      sourceId: `quiver-${row.Ticker}-${row.Representative || row.Senator}-${row.TransactionDate}`,
    }));
  } catch (e) {
    console.error("QuiverQuant fetch failed:", e);
    return [];
  }
}

// Combined fetch with fallbacks
async function fetchCongressTrades(): Promise<CongressTrade[]> {
  // Try QuiverQuant first (better structured data)
  let trades = await fetchQuiverQuantTrades();
  
  if (trades.length === 0) {
    // Fallback to House disclosures scraping
    trades = await fetchHouseDisclosures();
  }
  
  return trades;
}

export async function POST() {
  try {
    const trades = await fetchCongressTrades();
    
    if (trades.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "No trades fetched from source (Capitol Trades down, fallbacks unavailable)",
        synced: 0,
      });
    }
    
    let synced = 0;
    let skipped = 0;
    
    for (const trade of trades) {
      if (!trade.transactionDate || !trade.ticker) continue;
      
      // Check if record already exists
      const existing = await db.get(sql`
        SELECT id FROM congress_trades 
        WHERE source_id = ${trade.sourceId}
        LIMIT 1
      `);
      
      if (existing) {
        skipped++;
        continue;
      }
      
      // Insert new record
      await db.run(sql`
        INSERT INTO congress_trades (
          member_name, party, state, chamber, ticker,
          transaction_type, amount_range, transaction_date, filed_date, source_id
        ) VALUES (
          ${trade.memberName},
          ${trade.party},
          ${trade.state},
          ${trade.chamber},
          ${trade.ticker},
          ${trade.transactionType},
          ${trade.amountRange},
          ${trade.transactionDate},
          ${trade.filedDate},
          ${trade.sourceId}
        )
      `);
      
      synced++;
    }
    
    return NextResponse.json({
      success: true,
      synced,
      skipped,
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
