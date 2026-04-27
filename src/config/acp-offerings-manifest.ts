/**
 * THE source of truth for which offerings Claudius Inc lists on ACP V2.
 *
 * HARD CAP: 10 offerings. This is a deliberate strategic limit (the per-agent
 * marketplace cap is 10; we bind tighter to one slot per offering to avoid
 * diluting Butler's per-offering rerank weight).
 *
 * To CHANGE the manifest:
 *   1. Edit this file. Remove an entry to add a new one.
 *   2. The hourly sweep cron (`/api/cron/acp-offering-sweep`) will hide any
 *      live V2 offering not in this list, and reject any attempt to create one
 *      via the HQ API.
 *   3. There is no "skip" flag, no env-var bypass, and no "I know what I'm
 *      doing" override. If you need to add an offering, edit THIS FILE in a
 *      commit. The git history is the audit log.
 *
 * To DISABLE enforcement temporarily (for migrations, debugging):
 *   set ACP_MANIFEST_MODE=dry-run in env. Sweep will only log; guards still
 *   throw. Default mode is "enforce".
 */

export const ACP_OFFERING_MANIFEST = Object.freeze([
  // Reads (high frequency, cheap) — agent infrastructure
  "live_price",
  "fear_greed",
  "funding_rate_signal",
  "token_safety_quick",
  // Analysis (mid frequency) — agent decision support
  "portfolio_risk_metrics",
  "token_alpha_report",
  "dex_arbitrage",
  // Whitespace primitives (zero/weak competitors per 2026-04-27 research)
  "tx_simulate", // pre-flight EVM tx → revertReason / gasUsed / events
  "abi_decode", // calldata + log decoding for executor + scout fleets
  "url_reader", // URL → clean structured markdown for content pipelines
] as const);

export type ManifestOffering = typeof ACP_OFFERING_MANIFEST[number];

export const MAX_OFFERINGS = 10;

if (ACP_OFFERING_MANIFEST.length > MAX_OFFERINGS) {
  throw new Error(
    `acp-offerings-manifest exceeds MAX_OFFERINGS (${ACP_OFFERING_MANIFEST.length} > ${MAX_OFFERINGS}). ` +
      `Remove an entry before adding a new one.`
  );
}

const dupes = ACP_OFFERING_MANIFEST.filter(
  (n, i) => ACP_OFFERING_MANIFEST.indexOf(n) !== i
);
if (dupes.length) {
  throw new Error(`acp-offerings-manifest has duplicates: ${dupes.join(", ")}`);
}

export type ManifestMode = "enforce" | "dry-run";

export function getManifestMode(): ManifestMode {
  return process.env.ACP_MANIFEST_MODE === "dry-run" ? "dry-run" : "enforce";
}

export function isAllowedOffering(name: string): boolean {
  return (ACP_OFFERING_MANIFEST as readonly string[]).includes(name);
}

/**
 * Throws unless `name` is in the manifest. In dry-run mode logs and returns.
 * Use at every code path that creates or republishes an ACP offering.
 */
export function assertAllowedOffering(
  name: string,
  context: string = "(unspecified)"
): void {
  if (isAllowedOffering(name)) return;
  const msg =
    `Offering '${name}' is not in src/config/acp-offerings-manifest.ts. ` +
    `Add it to the manifest (and remove one of the existing 10) to publish. ` +
    `Context: ${context}.`;
  if (getManifestMode() === "dry-run") {
    // Log only — caller proceeds. Used during migrations.
    // eslint-disable-next-line no-console
    console.warn(`[manifest:dry-run] ${msg}`);
    return;
  }
  throw new Error(msg);
}
