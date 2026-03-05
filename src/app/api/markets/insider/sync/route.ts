import { NextResponse } from "next/server";
import { db, insiderTrades } from "@/db";
import { sql } from "drizzle-orm";

// Sync endpoint - called by cron job
export const dynamic = "force-dynamic";

interface OpenInsiderTrade {
  date: string;
  ticker: string;
  company: string;
  insider: string;
  title: string;
  type: "buy" | "sell" | "exercise";
  shares: number;
  price: number;
  value: number;
}

// Fetch from OpenInsider (more structured data than SEC EDGAR RSS)
async function fetchOpenInsider(): Promise<OpenInsiderTrade[]> {
  try {
    const res = await fetch(
      "http://openinsider.com/screener?s=&o=&pl=&ph=&ll=&lh=&fd=7&fdr=&td=0&tdr=&fdlyl=&fdlyh=&dtefrom=&dteto=&xp=1&vl=25000&vh=&ocl=&och=&session=&sid=1&cnt=100",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      }
    );

    if (!res.ok) {
      console.error("OpenInsider error:", res.status);
      return [];
    }

    const html = await res.text();
    const trades: OpenInsiderTrade[] = [];
    
    // Find the tinytable - it has no closing </table> before the data rows end
    // Look for rows with style="background:#dfffdf" (purchases) or style="background:#ffefef" (sales)
    const rowRegex = /<tr\s+style="background:#[a-f0-9]+"\s*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    
    const extractText = (cellHtml: string) => {
      return cellHtml
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
    };
    
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cells = rowHtml.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
      
      // OpenInsider columns:
      // 0: TC code, 1: Filing date, 2: Trade date, 3: Ticker, 4: Company,
      // 5: Insider, 6: Title, 7: Trade type, 8: Price, 9: Qty, 10: Owned,
      // 11: Own Chg %, 12: Value, 13-15: Performance
      if (cells.length < 13) continue;
      
      const filingDateStr = extractText(cells[1] || "");
      const tradeDateStr = extractText(cells[2] || "");
      const ticker = extractText(cells[3] || "");
      const company = extractText(cells[4] || "");
      const insider = extractText(cells[5] || "");
      const title = extractText(cells[6] || "");
      const tradeTypeRaw = extractText(cells[7] || "").toLowerCase();
      const priceStr = extractText(cells[8] || "");
      const sharesStr = extractText(cells[9] || "");
      const valueStr = extractText(cells[12] || "");
      
      // Skip if no valid ticker (may be empty or too long)
      if (!ticker || ticker.length > 10 || ticker === "TC") continue;
      
      // Parse date - use trade date, fallback to filing date
      const dateStr = tradeDateStr || filingDateStr.split(" ")[0] || "";
      if (!dateStr) continue;
      
      const shares = Math.abs(parseInt(sharesStr.replace(/[^0-9.-]/g, "")) || 0);
      const price = parseFloat(priceStr.replace(/[^0-9.$-]/g, "")) || 0;
      const value = Math.abs(parseInt(valueStr.replace(/[^0-9.-]/g, "")) || 0);
      
      // Determine trade type from the raw text
      // P - Purchase, S - Sale, A - Grant, M - Option Ex, etc.
      let type: "buy" | "sell" | "exercise" = "exercise";
      if (tradeTypeRaw.startsWith("p") || tradeTypeRaw.includes("purchase")) type = "buy";
      else if (tradeTypeRaw.startsWith("s") || tradeTypeRaw.includes("sale")) type = "sell";
      
      trades.push({
        date: dateStr,
        ticker,
        company,
        insider,
        title,
        type,
        shares,
        price,
        value,
      });
    }
    
    console.log(`OpenInsider: parsed ${trades.length} trades from HTML`);
    return trades;
  } catch (e) {
    console.error("Failed to fetch OpenInsider:", e);
    return [];
  }
}

export async function POST() {
  try {
    const trades = await fetchOpenInsider();
    
    if (trades.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "No trades fetched from source",
        synced: 0,
      });
    }
    
    let synced = 0;
    
    for (const trade of trades) {
      if (!trade.date || !trade.ticker) continue;
      
      const sourceId = `${trade.date}-${trade.ticker}-${trade.insider}-${trade.type}`;
      
      // Upsert using INSERT OR REPLACE
      await db.run(sql`
        INSERT INTO insider_trades (
          company, ticker, insider_name, title,
          transaction_type, shares, price, value,
          transaction_date, source_id
        ) VALUES (
          ${trade.company},
          ${trade.ticker},
          ${trade.insider},
          ${trade.title},
          ${trade.type},
          ${trade.shares},
          ${trade.price},
          ${trade.value},
          ${trade.date},
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
    console.error("Insider trades sync error:", e);
    return NextResponse.json({
      success: false,
      error: String(e),
      synced: 0,
    }, { status: 500 });
  }
}
