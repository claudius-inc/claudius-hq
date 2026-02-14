import { NextResponse } from "next/server";
import { db, portfolioHoldings } from "@/db";
import { desc } from "drizzle-orm";

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "https://gateway.claudiusinc.com";
const GATEWAY_KEY = process.env.OPENCLAW_GATEWAY_TOKEN || "";

// POST /api/portfolio/analyze — Trigger portfolio analysis
export async function POST() {
  try {
    // Get current holdings
    const holdings = await db
      .select()
      .from(portfolioHoldings)
      .orderBy(desc(portfolioHoldings.targetAllocation));

    if (holdings.length === 0) {
      return NextResponse.json(
        { error: "No holdings to analyze" },
        { status: 400 }
      );
    }

    // Build the portfolio string
    const portfolioStr = holdings
      .map((h) => `${h.ticker} (${h.targetAllocation}%)`)
      .join(", ");

    // Spawn analysis via OpenClaw gateway
    const task = `Analyze this portfolio using the portfolio-analysis skill and save the report to HQ.

Portfolio holdings: ${portfolioStr}

Requirements:
- Read the portfolio-analysis skill at /root/openclaw/skills/portfolio-analysis/SKILL.md
- Generate a comprehensive Sun Tzu Portfolio Construction Report
- Use the 6-dimension scoring matrix (ROIC Quality, Structural Tailwind, EPS Growth, Technical Posture, Balance Sheet, Catalyst & Flow)
- Include investor critiques from all 6 legendary investors
- Save the report via POST to https://claudiusinc.com/api/portfolio/reports with x-api-key header
- Include summary field with key findings`;

    const response = await fetch(`${GATEWAY_URL}/tools/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GATEWAY_KEY}`,
      },
      body: JSON.stringify({
        tool: "sessions_spawn",
        args: {
          task,
          thinking: "high",
          runTimeoutSeconds: 600,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Gateway error:", text);
      return NextResponse.json(
        { error: "Failed to start analysis" },
        { status: 500 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: "Portfolio analysis started",
      sessionKey: data.result?.sessionKey,
    });
  } catch (e) {
    console.error("Analysis error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
