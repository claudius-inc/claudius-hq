import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { silverStocks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import * as XLSX from "xlsx";

const API_KEY = process.env.HQ_API_KEY;
const CME_SILVER_URL = "https://www.cmegroup.com/delivery_reports/Silver_stocks.xls";

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

interface ParsedSilverData {
  reportDate: string;
  activityDate: string;
  registeredOz: number;
  eligibleOz: number;
  totalOz: number;
}

function parseXlsData(buffer: ArrayBuffer): ParsedSilverData | null {
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to array of arrays
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    let reportDate = "";
    let activityDate = "";
    let registeredOz = 0;
    let eligibleOz = 0;
    let totalOz = 0;
    
    for (const row of data) {
      const rowStr = row.join(" ");
      
      // Extract report date
      if (rowStr.includes("Report Date:")) {
        const match = rowStr.match(/Report Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (match) {
          // Convert M/D/YYYY to YYYY-MM-DD
          const [m, d, y] = match[1].split("/");
          reportDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
      }
      
      // Extract activity date
      if (rowStr.includes("Activity Date:")) {
        const match = rowStr.match(/Activity Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (match) {
          const [m, d, y] = match[1].split("/");
          activityDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
      }
      
      // Extract totals (look for "TOTAL REGISTERED", "TOTAL ELIGIBLE", "COMBINED TOTAL")
      if (row[0] === "TOTAL REGISTERED") {
        // The "TOTAL TODAY" value is typically in the last populated column
        const values = row.filter(v => typeof v === "number") as number[];
        if (values.length > 0) {
          registeredOz = values[values.length - 1];
        }
      }
      
      if (row[0] === "TOTAL ELIGIBLE") {
        const values = row.filter(v => typeof v === "number") as number[];
        if (values.length > 0) {
          eligibleOz = values[values.length - 1];
        }
      }
      
      if (row[0] === "COMBINED TOTAL") {
        const values = row.filter(v => typeof v === "number") as number[];
        if (values.length > 0) {
          totalOz = values[values.length - 1];
        }
      }
    }
    
    if (!activityDate || registeredOz === 0) {
      logger.warn("api/markets/silver/sync", "Failed to parse required fields", {
        reportDate,
        activityDate,
        registeredOz,
      });
      return null;
    }
    
    return {
      reportDate,
      activityDate,
      registeredOz,
      eligibleOz,
      totalOz,
    };
  } catch (error) {
    logger.error("api/markets/silver/sync", "XLS parsing error", { error });
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch XLS from CME
    logger.info("api/markets/silver/sync", "Fetching CME silver stocks XLS");
    
    const response = await fetch(CME_SILVER_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    
    if (!response.ok) {
      logger.error("api/markets/silver/sync", "Failed to fetch CME XLS", { 
        status: response.status 
      });
      return NextResponse.json({ 
        error: "Failed to fetch CME data",
        status: response.status 
      }, { status: 502 });
    }
    
    const buffer = await response.arrayBuffer();
    logger.info("api/markets/silver/sync", `Fetched ${buffer.byteLength} bytes`);
    
    // Parse the XLS
    const parsed = parseXlsData(buffer);
    
    if (!parsed) {
      return NextResponse.json({ 
        error: "Failed to parse XLS data" 
      }, { status: 500 });
    }
    
    logger.info("api/markets/silver/sync", "Parsed silver data", { ...parsed });
    
    // Check if we already have this date
    const existing = await db
      .select()
      .from(silverStocks)
      .where(eq(silverStocks.activityDate, parsed.activityDate))
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing record
      await db
        .update(silverStocks)
        .set({
          reportDate: parsed.reportDate,
          registeredOz: parsed.registeredOz,
          eligibleOz: parsed.eligibleOz,
          totalOz: parsed.totalOz,
        })
        .where(eq(silverStocks.activityDate, parsed.activityDate));
      
      return NextResponse.json({
        success: true,
        action: "updated",
        data: parsed,
      });
    }
    
    // Insert new record
    await db.insert(silverStocks).values({
      reportDate: parsed.reportDate,
      activityDate: parsed.activityDate,
      registeredOz: parsed.registeredOz,
      eligibleOz: parsed.eligibleOz,
      totalOz: parsed.totalOz,
    });
    
    return NextResponse.json({
      success: true,
      action: "inserted",
      data: parsed,
    });
    
  } catch (error) {
    logger.error("api/markets/silver/sync", "Silver sync error", { error });
    return NextResponse.json({ 
      error: "Silver sync failed",
      details: String(error),
    }, { status: 500 });
  }
}

// GET: Return sync status
export async function GET() {
  try {
    const latest = await db
      .select()
      .from(silverStocks)
      .orderBy(silverStocks.activityDate)
      .limit(1);
    
    return NextResponse.json({
      latestActivityDate: latest[0]?.activityDate || null,
      latestReportDate: latest[0]?.reportDate || null,
      source: "CME Group COMEX Silver Stocks",
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to get sync status" }, { status: 500 });
  }
}
