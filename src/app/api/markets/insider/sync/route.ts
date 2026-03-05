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
          "User-Agent": "Mozilla/5.0 (compatible; ClaudiusHQ/1.0)",
        },
      }
    );

    if (!res.ok) {
      console.error("OpenInsider error:", res.status);
      return [];
    }

    const html = await res.text();
    const trades: OpenInsiderTrade[] = [];
    
    // Parse HTML table - look for tinytable rows
    const tableMatch = html.match(/<table[^>]*class="[^"]*tinytable[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) return [];
    
    const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    
    for (const row of rows) {
      // Skip header rows
      if (row.includes("<th")) continue;
      
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length < 13) continue;
      
      const extractText = (html: string) => {
        return html
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .trim();
      };
      
      const dateStr = extractText(cells[1] || "");
      const ticker = extractText(cells[3] || "");
      const company = extractText(cells[4] || "");
      const insider = extractText(cells[5] || "");
      const title = extractText(cells[6] || "");
      const tradeTypeRaw = extractText(cells[7] || "").toLowerCase();
      const sharesStr = extractText(cells[9] || "");
      const priceStr = extractText(cells[10] || "");
      const valueStr = extractText(cells[12] || "");
      
      if (!ticker || ticker.length > 10) continue;
      
      const shares = parseInt(sharesStr.replace(/[^0-9.-]/g, "")) || 0;
      const price = parseFloat(priceStr.replace(/[^0-9.-]/g, "")) || 0;
      const value = parseInt(valueStr.replace(/[^0-9.-]/g, "")) || 0;
      
      let type: "buy" | "sell" | "exercise" = "exercise";
      if (tradeTypeRaw.includes("p") || tradeTypeRaw === "buy") type = "buy";
      if (tradeTypeRaw.includes("s") || tradeTypeRaw === "sale") type = "sell";
      
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
