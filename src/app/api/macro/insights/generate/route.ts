import { NextResponse } from "next/server";
import { db } from "@/db";
import { macroInsights } from "@/db/schema";
import { fetchMacroData } from "@/lib/fetch-macro-data";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export async function POST() {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    // Fetch current macro data directly (no API self-call)
    const macroData = await fetchMacroData();

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

    const prompt = `You are a macro analyst. Analyze the following economic indicators and provide concise, actionable insights for investors.

Current Indicators:
${JSON.stringify(indicatorSummary, null, 2)}

Provide your analysis in the following format (use markdown):

## 🎯 Market Regime
(2-3 sentences describing the current macro environment)

## ⚠️ Key Risks
- (bullet point)
- (bullet point)
- (bullet point)

## 💡 Opportunities
- (bullet point)
- (bullet point)
- (bullet point)

## 👀 Watch This Week
- (bullet point)
- (bullet point)
- (bullet point)

## 🔥 Notable
(One standout observation that connects multiple indicators)

Keep it concise and data-driven. No fluff. Reference specific indicator values when relevant.`;

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
        max_tokens: 1000,
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
        indicatorSnapshot: JSON.stringify(indicatorSummary),
      })
      .returning();

    return NextResponse.json({
      insights: newInsight.insights,
      generatedAt: newInsight.generatedAt,
      indicatorSnapshot: indicatorSummary,
    });
  } catch (error) {
    console.error("Error generating macro insights:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
