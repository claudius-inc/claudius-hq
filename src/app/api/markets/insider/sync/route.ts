import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

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
      logger.error("api/markets/insider/sync", "OpenInsider error", { status: res.status });
      return [];
    }

    const html = await res.text();
    const trades: OpenInsiderTrade[] = [];
    
    const extractText = (cellHtml: string) => {
      // First remove script content and onmouseover/onmouseout handlers
      let cleaned = cellHtml
        .replace(/onmouseover="[^"]*"/gi, "")
        .replace(/onmouseout="[^"]*"/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "");
      
      return cleaned
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
    };
    
    // Extract ticker specifically from the link pattern
    const extractTicker = (cellHtml: string) => {
      // Look for pattern: <a href="/TICKER">TICKER</a>
      const match = cellHtml.match(/<a href="\/([A-Z0-9]+)"[^>]*>[^<]*\1<\/a>/i);
      if (match) return match[1];
      
      // Fallback: look for ticker in bold link
      const fallback = cellHtml.match(/<b>\s*<a[^>]*>([A-Z0-9]+)<\/a>\s*<\/b>/i);
      if (fallback) return fallback[1];
      
      // Last resort: extract text
      return extractText(cellHtml);
    };
    
    // Split by row start - rows have style="background:#..." 
    // Use a more lenient approach since title attrs contain newlines
    const rowParts = html.split(/<tr\s+style="background:#[a-f0-9]+"\s*>/i);
    
    for (let i = 1; i < rowParts.length; i++) {
      const rowContent = rowParts[i];
      
      // Extract cells - they may span multiple lines due to title attributes
      // Match from <td to the next </td>, being careful about nested content
      const cellMatches: string[] = [];
      let cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        cellMatches.push(cellMatch[1]);
        if (cellMatches.length >= 16) break; // Max expected columns
      }
      
      // OpenInsider columns:
      // 0: TC code, 1: Filing date, 2: Trade date, 3: Ticker, 4: Company,
      // 5: Insider, 6: Title, 7: Trade type, 8: Price, 9: Qty, 10: Owned,
      // 11: Own Chg %, 12: Value, 13-15: Performance
      if (cellMatches.length < 13) continue;
      
      const filingDateStr = extractText(cellMatches[1] || "");
      const tradeDateStr = extractText(cellMatches[2] || "");
      const ticker = extractTicker(cellMatches[3] || "");
      const company = extractText(cellMatches[4] || "");
      const insider = extractText(cellMatches[5] || "");
      const title = extractText(cellMatches[6] || "");
      const tradeTypeRaw = extractText(cellMatches[7] || "").toLowerCase();
      const priceStr = extractText(cellMatches[8] || "");
      const sharesStr = extractText(cellMatches[9] || "");
      const valueStr = extractText(cellMatches[12] || "");
      
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
    
    logger.info("api/markets/insider/sync", `OpenInsider: parsed ${trades.length} trades from HTML`);
    return trades;
  } catch (e) {
    logger.error("api/markets/insider/sync", "Failed to fetch OpenInsider", { error: e });
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
    logger.error("api/markets/insider/sync", "Insider trades sync error", { error: e });
    return NextResponse.json({
      success: false,
      error: String(e),
      synced: 0,
    }, { status: 500 });
  }
}
