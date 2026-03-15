import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
}

export interface FxResponse {
  usdjpy: { price: number; changePercent: number } | null;
  usdcnh: { price: number; changePercent: number } | null;
  tenYearYield: { value: number; changePercent: number } | null;
  updatedAt: string;
}

export async function GET(_req: NextRequest) {
  if (!checkApiAuth(_req)) return unauthorizedResponse();
  try {
  if (!checkApiAuth(_req)) return unauthorizedResponse();
    let usdjpy: FxResponse["usdjpy"] = null;
    let usdcnh: FxResponse["usdcnh"] = null;
    let tenYearYield: FxResponse["tenYearYield"] = null;

    // Fetch USD/JPY
    try {
      const quote = (await yahooFinance.quote("JPY=X")) as QuoteResult;
      if (quote?.regularMarketPrice) {
        usdjpy = {
          price: quote.regularMarketPrice,
          changePercent: quote.regularMarketChangePercent ?? 0,
        };
      }
    } catch {
      // USD/JPY fetch failed
    }

    // Fetch USD/CNH (offshore yuan)
    try {
      const quote = (await yahooFinance.quote("CNH=X")) as QuoteResult;
      if (quote?.regularMarketPrice) {
        usdcnh = {
          price: quote.regularMarketPrice,
          changePercent: quote.regularMarketChangePercent ?? 0,
        };
      }
    } catch {
      // USD/CNH fetch failed
    }

    // Fetch 10-Year Treasury Yield
    try {
      const quote = (await yahooFinance.quote("^TNX")) as QuoteResult;
      if (quote?.regularMarketPrice) {
        tenYearYield = {
          value: quote.regularMarketPrice,
          changePercent: quote.regularMarketChangePercent ?? 0,
        };
      }
    } catch {
      // 10Y yield fetch failed
    }

    const response: FxResponse = {
      usdjpy,
      usdcnh,
      tenYearYield,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("FX API error:", error);
    return NextResponse.json(
      {
        usdjpy: null,
        usdcnh: null,
        tenYearYield: null,
        updatedAt: new Date().toISOString(),
        error: "Failed to fetch FX data",
      },
      { status: 500 }
    );
  }
}
