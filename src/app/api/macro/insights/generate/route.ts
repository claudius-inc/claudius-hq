import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { macroInsights } from "@/db/schema";
import { fetchMacroData } from "@/lib/fetch-macro-data";
import { rateLimit } from "@/lib/rate-limit";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "anonymous";
  const { success } = limiter.check(3, ip);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const baseUrl = new URL(request.url).origin;

    // Fetch ALL market data in parallel
    const [macroData, sentimentRes, breadthRes, congressRes, insiderRes, etfRes, goldRes] = await Promise.all([
      fetchMacroData(),
      fetch(`${baseUrl}/api/markets/sentiment`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${baseUrl}/api/markets/breadth`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${baseUrl}/api/markets/congress`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${baseUrl}/api/markets/insider`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${baseUrl}/api/macro/etfs`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${baseUrl}/api/gold`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    // Build indicator summary for the prompt
    const indicatorSummary = macroData.indicators
      .filter((ind) => ind.data)
      .map((ind) => ({
        name: ind.name,
        currentValue: `${ind.data!.current}${ind.unit === "%" || ind.unit === "% YoY" ? "%" : ind.unit === "bps" ? " bps" : ""}`,
        interpretation: ind.interpretation?.label || "N/A",
        meaning: ind.interpretation?.meaning || "N/A",
        percentile: ind.percentile ? `${ind.percentile}th percentile` : "N/A",
      }));

    // Build sentiment summary
    const sentimentSummary = sentimentRes ? {
      vix: sentimentRes.vix?.value != null ? { value: sentimentRes.vix.value, change: sentimentRes.vix.change, level: sentimentRes.vix.level } : null,
      putCallRatio: sentimentRes.putCall?.value != null ? { value: sentimentRes.putCall.value, level: sentimentRes.putCall.level } : null,
      vixTermStructure: sentimentRes.volatilityContext ? { ratio: sentimentRes.volatilityContext.termStructure, state: sentimentRes.volatilityContext.contango } : null,
    } : null;

    // Build breadth summary
    const breadthSummary = breadthRes ? {
      advanceDeclineRatio: breadthRes.advanceDecline?.ratio,
      advances: breadthRes.advanceDecline?.advances,
      declines: breadthRes.advanceDecline?.declines,
      newHighs: breadthRes.newHighsLows?.newHighs,
      newLows: breadthRes.newHighsLows?.newLows,
      level: breadthRes.level,
      mcclellanOscillator: breadthRes.mcclellan?.oscillator,
      interpretation: breadthRes.interpretation,
    } : null;

    // Build smart money summary
    const smartMoneySummary = {
      congress: congressRes && congressRes.totalTrades > 0 ? {
        buyCount: congressRes.buyCount,
        sellCount: congressRes.sellCount,
        buySellRatio: congressRes.ratio,
        level: congressRes.level,
        topTickers: congressRes.topTickers?.slice(0, 5).map((t: { ticker: string; count: number }) => t.ticker),
      } : null,
      insiders: insiderRes && insiderRes.totalTrades > 0 ? {
        buyCount: insiderRes.buyCount,
        sellCount: insiderRes.sellCount,
        buySellRatio: insiderRes.ratio,
        buyValue: `$${(insiderRes.buyValue / 1e6).toFixed(1)}M`,
        sellValue: `$${(insiderRes.sellValue / 1e6).toFixed(1)}M`,
        level: insiderRes.level,
        clusterBuys: insiderRes.clusterBuys?.slice(0, 5).map((t: { ticker: string; buys: number }) => t.ticker),
      } : null,
    };

    // Build ETF barometers summary
    const etfSummary = etfRes?.etfs?.filter((e: { data: unknown }) => e.data).map((e: { ticker: string; name: string; data: { price: number; changePercent: number; rangePosition: number }; interpretation: { label: string } | null }) => ({
      ticker: e.ticker,
      name: e.name,
      price: e.data.price,
      changePercent: `${e.data.changePercent >= 0 ? "+" : ""}${e.data.changePercent.toFixed(2)}%`,
      rangePosition: `${e.data.rangePosition}th percentile of 52W range`,
      interpretation: e.interpretation?.label || "N/A",
    })) || [];

    // Build gold/real yields summary
    const goldSummary = goldRes ? {
      goldPrice: goldRes.livePrice?.price,
      goldChange: goldRes.livePrice?.changePercent != null ? `${goldRes.livePrice.changePercent >= 0 ? "+" : ""}${goldRes.livePrice.changePercent.toFixed(2)}%` : null,
      realYield: goldRes.realYields?.value != null ? `${goldRes.realYields.value.toFixed(2)}%` : null,
      dxy: goldRes.dxy?.price,
    } : null;

    // Build yield spread summary from macro data
    const yieldSpreadSummary = macroData.yieldSpreads?.map((s: { name: string; value: number | null; interpretation: string }) => ({
      name: s.name,
      value: s.value != null ? `${s.value}%` : "N/A",
      interpretation: s.interpretation,
    })) || [];

    // Combine everything into the full snapshot
    const fullSnapshot = {
      indicators: indicatorSummary,
      sentiment: sentimentSummary,
      breadth: breadthSummary,
      smartMoney: smartMoneySummary,
      etfBarometers: etfSummary,
      gold: goldSummary,
      yieldSpreads: yieldSpreadSummary,
    };

    const prompt = `You are a macro analyst. Analyze ALL of the following market data and provide concise, actionable insights for investors.

Economic Indicators:
${JSON.stringify(indicatorSummary, null, 2)}

Market Sentiment:
${sentimentSummary ? JSON.stringify(sentimentSummary, null, 2) : "Unavailable"}

Market Breadth:
${breadthSummary ? JSON.stringify(breadthSummary, null, 2) : "Unavailable"}

Smart Money (Congress & Insider Trading):
${JSON.stringify(smartMoneySummary, null, 2)}

ETF Barometers:
${etfSummary.length > 0 ? JSON.stringify(etfSummary, null, 2) : "Unavailable"}

Gold & Real Yields:
${goldSummary ? JSON.stringify(goldSummary, null, 2) : "Unavailable"}

Yield Spreads (Carry Trade):
${yieldSpreadSummary.length > 0 ? JSON.stringify(yieldSpreadSummary, null, 2) : "Unavailable"}

Provide your analysis in the following format (use markdown):

## Market Regime
(2-3 sentences describing the current macro environment, incorporating sentiment, breadth, and smart money signals alongside macro indicators)

## Key Risks
- (bullet point)
- (bullet point)
- (bullet point)

## Opportunities
- (bullet point)
- (bullet point)
- (bullet point)

## Smart Money & Sentiment
(2-3 sentences on what positioning data — VIX, put/call, breadth, Congress trades, insider buying — tells us about near-term direction)

## Watch This Week
- (bullet point)
- (bullet point)
- (bullet point)

## Notable
(One standout observation that connects multiple data sources — e.g. linking macro indicators with sentiment or smart money signals)

Keep it concise and data-driven. No fluff. Reference specific values when relevant.`;

    // Call Gemini API (OpenAI-compatible endpoint)
    const geminiRes = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error("Gemini API error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate insights" },
        { status: 500 }
      );
    }

    const geminiData = await geminiRes.json();
    const insights = geminiData.choices?.[0]?.message?.content;

    if (!insights) {
      return NextResponse.json(
        { error: "No insights generated" },
        { status: 500 }
      );
    }

    // Store in database
    const [newInsight] = await db
      .insert(macroInsights)
      .values({
        insights,
        indicatorSnapshot: JSON.stringify(fullSnapshot),
      })
      .returning();

    return NextResponse.json({
      insights: newInsight.insights,
      generatedAt: newInsight.generatedAt,
      indicatorSnapshot: fullSnapshot,
    });
  } catch (error) {
    console.error("Error generating macro insights:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
