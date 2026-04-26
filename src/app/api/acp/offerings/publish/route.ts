import { NextResponse } from "next/server";

const V2_AGENT_ID = process.env.ACP_V2_AGENT_ID || "019dc9e1-8f53-79db-9f05-5889a0f8ef4a";
const V2_UI_URL = `https://app.virtuals.io/acp/agents/${V2_AGENT_ID}`;

// Removed 2026-04-26 after the V2 migration. V2 has no SDK or HTTP route for
// listing offerings — it's UI-only. The old implementation called the V1
// `createOffering` against `claw-api.virtuals.io`, which is now a zombie
// marketplace nobody buys from. Returning 410 to make any stale callers fail
// loudly instead of silently writing to the dead V1 system.
export async function POST() {
  return NextResponse.json(
    {
      error: "Gone",
      message: `Offering publish is UI-only on V2. Manage at ${V2_UI_URL}`,
      uiUrl: V2_UI_URL,
    },
    { status: 410 }
  );
}
