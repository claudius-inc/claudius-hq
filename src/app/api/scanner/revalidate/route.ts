import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

// Secret to prevent unauthorized revalidation
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || process.env.HQ_API_KEY;

export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token || token !== REVALIDATE_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Revalidate the scanner page
    revalidatePath("/markets/scanner");
    
    return NextResponse.json({
      success: true,
      revalidated: ["/markets/scanner"],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Revalidation error:", error);
    return NextResponse.json(
      { error: "Failed to revalidate" },
      { status: 500 }
    );
  }
}
