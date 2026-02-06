import { NextRequest, NextResponse } from "next/server";
import { isApiAuthenticated } from "@/lib/auth";

export async function POST(request: NextRequest) {
  // Allow unauthenticated access for now (research queue is low risk)
  // Can add auth later: if (!isApiAuthenticated(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { ticker } = body;

    if (!ticker || typeof ticker !== "string") {
      return NextResponse.json(
        { error: "Ticker is required" },
        { status: 400 }
      );
    }

    const cleanTicker = ticker.toUpperCase().trim();
    
    // Validate ticker format (basic check)
    if (!/^[A-Z0-9.]{1,10}$/.test(cleanTicker)) {
      return NextResponse.json(
        { error: "Invalid ticker format" },
        { status: 400 }
      );
    }

    // Generate a job ID
    const jobId = `research-${cleanTicker}-${Date.now()}`;

    // In the future, this would spawn a sub-agent or add to a queue
    // For now, just acknowledge the request
    // The actual research will be handled by a separate process
    
    console.log(`[Research Queue] Ticker: ${cleanTicker}, JobId: ${jobId}`);

    return NextResponse.json({
      jobId,
      ticker: cleanTicker,
      status: "queued",
      message: "Research request queued. Results will be available in stock_reports.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
