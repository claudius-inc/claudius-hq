import { NextResponse } from "next/server";
import { db, congressTrades } from "@/db";
import { sql, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

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
      logger.error("api/markets/congress/sync", "House Clerk error", { status: res.status });
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
    logger.error("api/markets/congress/sync", "Failed to fetch House disclosures", { error: e });
    return [];
  }
}

// Try multiple public data sources for Congress trades
async function fetchQuiverQuantTrades(): Promise<CongressTrade[]> {
  const sources = [
    {
      name: "QuiverQuant",
      url: "https://api.quiverquant.com/beta/live/congresstrading",
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; ClaudiusHQ/1.0)" },
    },
    {
      name: "CapitolTrades",
      url: "https://bff.capitoltrades.com/trades?pageSize=100",
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
    },
  ];
  
  for (const source of sources) {
    try {
      logger.info("api/markets/congress/sync", `Trying ${source.name}...`);
      const res = await fetch(source.url, {
        headers: source.headers,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });
      
      if (!res.ok) {
        logger.info("api/markets/congress/sync", `${source.name} returned ${res.status}`);
        continue;
      }
      
      const text = await res.text();
      // Check if response is HTML (blocked/error page)
      if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
        logger.info("api/markets/congress/sync", `${source.name} returned HTML (likely blocked)`);
        continue;
      }
      
      const data = JSON.parse(text);
      
      // Handle QuiverQuant format
      if (Array.isArray(data) && data.length > 0 && data[0].Representative) {
        logger.info("api/markets/congress/sync", `${source.name} returned ${data.length} trades`);
        return data.slice(0, 100).map((row: Record<string, unknown>) => ({
          memberName: String(row.Representative || row.Senator || "Unknown"),
          party: row.Party ? String(row.Party).charAt(0) : null,
          state: row.State ? String(row.State) : null,
          chamber: String(row.House || "").toLowerCase() === "senate" ? "senate" : "house",
          ticker: String(row.Ticker || "N/A"),
          transactionType: String(row.Transaction || "").toLowerCase().includes("purchase") ? "purchase" as const : "sale" as const,
          amountRange: row.Range ? String(row.Range) : null,
          transactionDate: String(row.TransactionDate || row.ReportDate || new Date().toISOString().split("T")[0]),
          filedDate: row.ReportDate ? String(row.ReportDate) : null,
          sourceId: `quiver-${row.Ticker}-${row.Representative || row.Senator}-${row.TransactionDate}`,
        }));
      }
      
      // Handle CapitolTrades format
      if (data.data && Array.isArray(data.data)) {
        logger.info("api/markets/congress/sync", `${source.name} returned ${data.data.length} trades`);
        return data.data.slice(0, 100).map((row: Record<string, unknown>) => {
          const politician = row.politician as Record<string, unknown> | undefined;
          const issuer = row.issuer as Record<string, unknown> | undefined;
          return {
            memberName: String(politician?.name || "Unknown"),
            party: politician?.party ? String(politician.party).charAt(0) : null,
            state: politician?.state ? String(politician.state) : null,
            chamber: String(politician?.chamber || "").toLowerCase() || null,
            ticker: String(issuer?.ticker || "N/A"),
            transactionType: String(row.txType || "").toLowerCase().includes("purchase") ? "purchase" as const : "sale" as const,
            amountRange: row.value ? String(row.value) : null,
            transactionDate: String(row.txDate || new Date().toISOString().split("T")[0]),
            filedDate: row.filingDate ? String(row.filingDate) : null,
            sourceId: `capitol-${row._txId || `${issuer?.ticker}-${politician?.name}-${row.txDate}`}`,
          };
        });
      }
      
      logger.warn("api/markets/congress/sync", `${source.name} returned unexpected format`);
    } catch (e) {
      logger.error("api/markets/congress/sync", `${source.name} failed`, { error: e });
    }
  }
  
  logger.warn("api/markets/congress/sync", "All Congress data sources unavailable");
  return [];
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
      const existing = await db.select({ id: congressTrades.id })
        .from(congressTrades)
        .where(eq(congressTrades.sourceId, trade.sourceId))
        .limit(1);
      
      if (existing.length > 0) {
        skipped++;
        continue;
      }
      
      // Insert new record
      await db.insert(congressTrades).values({
        memberName: trade.memberName,
        party: trade.party,
        state: trade.state,
        chamber: trade.chamber,
        ticker: trade.ticker,
        transactionType: trade.transactionType,
        amountRange: trade.amountRange,
        transactionDate: trade.transactionDate,
        filedDate: trade.filedDate,
        sourceId: trade.sourceId,
      });
      
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
    logger.error("api/markets/congress/sync", "Congress trades sync error", { error: e });
    return NextResponse.json({
      success: false,
      error: String(e),
      synced: 0,
    }, { status: 500 });
  }
}
