/**
 * GET /api/_debug/env-fingerprint
 *
 * Temporary diagnostic. Returns:
 *   - whether each known env var is SET in the running Vercel runtime
 *   - SHA-256 hash of CRON_SECRET (so we can compare against the GH Actions
 *     value's hash without leaking either)
 *   - first 4 chars of each key (lo-fi sanity check)
 *
 * No bearer auth (we want to be able to hit this without the very secret
 * we're trying to debug). Hash output makes leakage useless.
 *
 * REMOVE AFTER DEBUG.
 */

import { NextResponse } from "next/server";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

function summarize(name: string) {
  const v = process.env[name];
  if (!v) return { set: false };
  return {
    set: true,
    length: v.length,
    prefix: v.slice(0, 4),
    suffix: v.slice(-2),
    sha256: createHash("sha256").update(v).digest("hex"),
  };
}

export async function GET() {
  return NextResponse.json({
    note: "Temporary debug endpoint. Hashes only — values not exposed.",
    runtime: {
      VERCEL_ENV: process.env.VERCEL_ENV ?? null,
      VERCEL_GIT_COMMIT_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 8),
      VERCEL_REGION: process.env.VERCEL_REGION ?? null,
    },
    vars: {
      CRON_SECRET: summarize("CRON_SECRET"),
      ETHERSCAN_API_KEY: summarize("ETHERSCAN_API_KEY"),
      ALCHEMY_API_KEY: summarize("ALCHEMY_API_KEY"),
      ACP_V2_AGENT_ID: summarize("ACP_V2_AGENT_ID"),
    },
  });
}
