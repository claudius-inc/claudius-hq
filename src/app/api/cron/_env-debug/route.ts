/**
 * GET /api/cron/_env-debug
 *
 * Temporary diagnostic. Lives under /api/cron/* so it's whitelisted by
 * middleware. Returns SHA-256 hashes of the env vars (NOT values) so we can
 * compare against the GH Actions side without leaking secrets.
 *
 * Auth: same as other cron endpoints — x-vercel-cron header OR
 * Bearer ${CRON_SECRET}. We deliberately ALSO accept a missing-header
 * request that returns ONLY the boolean "is set" map, no hashes, so we can
 * sanity-check from outside without auth.
 *
 * REMOVE AFTER DEBUG.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

function summarize(name: string, full: boolean) {
  const v = process.env[name];
  if (!v) return { set: false };
  if (!full) return { set: true, length: v.length };
  return {
    set: true,
    length: v.length,
    prefix: v.slice(0, 4),
    suffix: v.slice(-2),
    sha256: createHash("sha256").update(v).digest("hex"),
  };
}

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  const full = isAuthorized(req);
  return NextResponse.json({
    note: "Temporary debug. Hashes shown only when auth succeeds.",
    authMode: full ? "ok" : "no-auth (boolean-only output)",
    runtime: {
      VERCEL_ENV: process.env.VERCEL_ENV ?? null,
      VERCEL_GIT_COMMIT_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 8),
      VERCEL_REGION: process.env.VERCEL_REGION ?? null,
    },
    vars: {
      CRON_SECRET: summarize("CRON_SECRET", full),
      ETHERSCAN_API_KEY: summarize("ETHERSCAN_API_KEY", full),
      ALCHEMY_API_KEY: summarize("ALCHEMY_API_KEY", full),
    },
  });
}
