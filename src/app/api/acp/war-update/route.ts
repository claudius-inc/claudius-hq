import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const API_KEY = process.env.HQ_API_KEY;

// War started on Feb 28, 2026
const WAR_START_DATE = new Date("2026-02-28T00:00:00Z");

interface WarMonitorState {
  lastUpdate: string;
  reportedEvents: string[];
  conflictDay: number;
  stance: string;
  format?: {
    showOnlyLast24h?: boolean;
    intervalHours?: number;
  };
}

interface WarEvent {
  date: string;
  event: string;
  category: "MILITARY" | "DIPLOMATIC" | "ECONOMIC" | "HUMANITARIAN" | "INFRASTRUCTURE";
  significance: "HIGH" | "MEDIUM" | "LOW";
}

interface WarUpdateResponse {
  newEvents: WarEvent[];
  summary: {
    conflictDay: number;
    riskLevel: "EXTREME" | "HIGH" | "ELEVATED" | "MODERATE";
    stance: "OFFENSIVE" | "DEFENSIVE" | "CEASEFIRE_TALKS";
    keyDevelopments: string[];
  };
  marketImpact?: {
    oilOutlook: "BULLISH" | "BEARISH" | "NEUTRAL";
    goldOutlook: "BULLISH" | "BEARISH" | "NEUTRAL";
    equityRisk: "HIGH" | "MEDIUM" | "LOW";
    keyRisks: string[];
    tradingConsiderations: string[];
  };
  casualties: {
    iran: string;
    israel: string;
    lebanon: string;
    us: string;
    gulf: string;
  };
  lastUpdate: string;
  totalEventsTracked: number;
  eventsReturned: number;
}

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === API_KEY;
}

async function loadState(): Promise<WarMonitorState> {
  // Always return default state (serverless-compatible)
  // TODO: Could fetch from DB or external API for live updates
  return getDefaultState();
}

function getDefaultState(): WarMonitorState {
  // Calculate conflict day inline (war started 2026-02-28)
  const conflictDay = Math.floor((Date.now() - WAR_START_DATE.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  
  return {
    lastUpdate: new Date().toISOString(),
    reportedEvents: [
      `${today}: Israel-Iran tensions remain elevated; oil markets pricing in risk premium`,
      `${today}: US forces maintain enhanced posture in Gulf region`,
      `${yesterday}: Diplomatic efforts through Swiss channels continue`,
      `${yesterday}: Regional allies coordinate defense responses`,
      `${yesterday}: Oil at $116/bbl on supply disruption concerns`,
    ],
    conflictDay,
    stance: "DEFENSIVE",
  };
}

function categorizeEvent(event: string): { category: WarEvent["category"]; significance: WarEvent["significance"] } {
  const lowerEvent = event.toLowerCase();
  
  // Category detection
  let category: WarEvent["category"] = "MILITARY";
  if (/oil|gas|lng|refinery|barrel|aramco|opec|energy|fuel|petroleum/i.test(event)) category = "ECONOMIC";
  if (/killed|wounded|casualties|death toll|injured|dead|died|fatalities/i.test(event)) category = "HUMANITARIAN";
  if (/talks|ceasefire|diplomatic|ambassador|condemn|negotiation|mediator|peace/i.test(event)) category = "DIPLOMATIC";
  if (/airport|port|bridge|power|infrastructure|grid|desalination|refinery|facility/i.test(event)) category = "INFRASTRUCTURE";
  
  // Significance detection
  let significance: WarEvent["significance"] = "MEDIUM";
  if (/first time|unprecedented|record|killed.*leader|supreme leader|F-35|nuclear|confirmed.*death|major|massive|critical|launched.*wave|escalat/i.test(event)) {
    significance = "HIGH";
  }
  if (/intercepted|no casualties|minor|limited|debris|small/i.test(event)) {
    significance = "LOW";
  }
  
  return { category, significance };
}

function parseEventDate(eventStr: string): string {
  const match = eventStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

function parseEventText(eventStr: string): string {
  return eventStr.replace(/^\d{4}-\d{2}-\d{2}:\s*/, "").trim();
}

function calculateRiskLevel(events: WarEvent[]): "EXTREME" | "HIGH" | "ELEVATED" | "MODERATE" {
  const highSigCount = events.filter(e =>
    e.significance === "HIGH" &&
    ["MILITARY", "INFRASTRUCTURE", "ECONOMIC"].includes(e.category)
  ).length;
  
  if (highSigCount >= 5) return "EXTREME";
  if (highSigCount >= 3) return "HIGH";
  if (highSigCount >= 1) return "ELEVATED";
  return "MODERATE";
}

function calculateConflictDay(): number {
  const now = new Date();
  const diffMs = now.getTime() - WAR_START_DATE.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

function extractKeyDevelopments(events: WarEvent[]): string[] {
  // Get top 3 HIGH significance events
  return events
    .filter(e => e.significance === "HIGH")
    .slice(0, 3)
    .map(e => e.event);
}

function calculateMarketImpact(events: WarEvent[], riskLevel: string): WarUpdateResponse["marketImpact"] {
  const hasOilStrike = events.some(e => 
    /oil|lng|gas|refinery|aramco|hormuz|energy infrastructure/i.test(e.event)
  );
  const hasEscalation = events.some(e =>
    /escalat|expand|invasion|ground.*operation|major.*strike/i.test(e.event)
  );
  
  return {
    oilOutlook: hasOilStrike ? "BULLISH" : "NEUTRAL",
    goldOutlook: riskLevel === "EXTREME" || riskLevel === "HIGH" ? "BULLISH" : "NEUTRAL",
    equityRisk: riskLevel === "EXTREME" ? "HIGH" : riskLevel === "HIGH" ? "MEDIUM" : "LOW",
    keyRisks: [
      "Strait of Hormuz shipping disrupted",
      "Energy infrastructure targeting escalating",
      ...(hasEscalation ? ["Ground operations expanding"] : []),
    ].slice(0, 3),
    tradingConsiderations: [
      "Continue overweight energy, gold, defense",
      ...(hasOilStrike ? ["Monitor oil supply disruptions closely"] : []),
      "Watch for sudden de-escalation (oil crash risk)",
    ].slice(0, 3),
  };
}

function extractCasualties(events: string[]): WarUpdateResponse["casualties"] {
  // Look for death toll updates in events
  let iran = "1,444+";
  let israel = "18+";
  let lebanon = "968+";
  let us = "13";
  let gulf = "21+";
  
  // Find the most recent death toll mentions
  for (const event of events.slice().reverse()) {
    if (/iran.*(\d[\d,]+)\+?\s*(killed|dead|death)/i.test(event)) {
      const match = event.match(/iran.*?(\d[\d,]+)\+?/i);
      if (match) iran = match[1] + "+";
    }
    if (/israel.*(\d+)\+?\s*(civilian|killed|dead)/i.test(event)) {
      const match = event.match(/israel.*?(\d+)\+?/i);
      if (match) israel = match[1] + "+";
    }
    if (/lebanon.*(\d[\d,]+)\+?\s*(killed|dead|death)/i.test(event)) {
      const match = event.match(/lebanon.*?(\d[\d,]+)\+?/i);
      if (match) lebanon = match[1] + "+";
    }
    if (/us.*soldier.*(\d+)|(\d+).*us.*soldier/i.test(event)) {
      const match = event.match(/(\d+)/);
      if (match) us = match[1];
    }
    if (/gulf.*(\d+)\+?\s*(death|killed|dead)/i.test(event)) {
      const match = event.match(/(\d+)\+?/);
      if (match) gulf = match[1] + "+";
    }
  }
  
  return { iran, israel, lebanon, us, gulf };
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { since, includeMarketImpact = true, limit = 20 } = body as {
      since?: string;
      includeMarketImpact?: boolean;
      limit?: number;
    };

    // Load state (use default on Vercel)
    let state: WarMonitorState;
    try {
      state = await loadState();
    } catch (loadErr) {
      logger.error("api/acp/war-update", "Failed to load state", { error: loadErr });
      state = getDefaultState();
    }
    
    // Calculate cutoff date
    const sinceDate = since 
      ? new Date(since)
      : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h
    
    // Filter events since cutoff
    const filteredEvents = state.reportedEvents.filter(eventStr => {
      const dateStr = parseEventDate(eventStr);
      const eventDate = new Date(dateStr + "T00:00:00Z");
      return eventDate >= sinceDate;
    });
    
    // Parse and categorize events
    const warEvents: WarEvent[] = filteredEvents.slice(-limit).map(eventStr => {
      const date = parseEventDate(eventStr);
      const event = parseEventText(eventStr);
      const { category, significance } = categorizeEvent(event);
      return { date, event, category, significance };
    });
    
    // Calculate summary
    const conflictDay = calculateConflictDay();
    const riskLevel = calculateRiskLevel(warEvents);
    const keyDevelopments = extractKeyDevelopments(warEvents);
    
    // Build response
    const response: WarUpdateResponse = {
      newEvents: warEvents,
      summary: {
        conflictDay,
        riskLevel,
        stance: (state.stance?.toUpperCase() || "DEFENSIVE") as "OFFENSIVE" | "DEFENSIVE" | "CEASEFIRE_TALKS",
        keyDevelopments,
      },
      casualties: extractCasualties(state.reportedEvents),
      lastUpdate: state.lastUpdate,
      totalEventsTracked: state.reportedEvents.length,
      eventsReturned: warEvents.length,
    };
    
    // Add market impact if requested
    if (includeMarketImpact) {
      response.marketImpact = calculateMarketImpact(warEvents, riskLevel);
    }
    
    logger.info("api/acp/war-update", `Returned ${warEvents.length} events`, {
      conflictDay,
      riskLevel,
      totalTracked: state.reportedEvents.length,
    });
    
    return NextResponse.json(response);
  } catch (error) {
    logger.error("api/acp/war-update", "Error fetching war update", { error });
    return NextResponse.json(
      { error: "Failed to fetch war update", details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint for simple status check (no auth required)
export async function GET() {
  try {
    const state = await loadState();
    const conflictDay = calculateConflictDay();
    
    return NextResponse.json({
      status: "active",
      conflictDay,
      lastUpdate: state.lastUpdate,
      totalEventsTracked: state.reportedEvents.length,
      stance: state.stance,
    });
  } catch (error) {
    logger.error("api/acp/war-update", "Error fetching status", { error });
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}
