import { NextResponse } from "next/server";

const V2_AGENT_ID = process.env.ACP_V2_AGENT_ID || "019dc9e1-8f53-79db-9f05-5889a0f8ef4a";
const V2_UI_URL = `https://app.virtuals.io/acp/agents/${V2_AGENT_ID}`;

// Removed 2026-04-26 — see publish/route.ts for the explanation.
export async function POST() {
  return NextResponse.json(
    {
      error: "Gone",
      message: `Offering unpublish (hide) is UI-only on V2. Manage at ${V2_UI_URL}`,
      uiUrl: V2_UI_URL,
    },
    { status: 410 }
  );
}
